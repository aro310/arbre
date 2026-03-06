const NODE_RADIUS = 30;
const PHOTO_RADIUS = 25;
const SINGLE_WIDTH = 140;
const COUPLE_WIDTH = 280;
const GENERATION_HEIGHT = 180;
const TOP_MARGIN = 50;
const SIDE_MARGIN = 60;
const CONNECTOR_GAP = 60;
const UNIT_SPACING = 12;
const FAMILY_SPACING = 54;
const COUPLE_GAP = 140;
const CONNECTOR_LANE_STEP = 22;
const PLACEHOLDER_PHOTO =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="%23e5e7eb"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="16" fill="%236b7280">Photo</text></svg>';

const PHOTO_CACHE = new Map();
let renderVersion = 0;

function formatDates(person) {
  return person.death_date ? `${person.birth_date} - ${person.death_date}` : `${person.birth_date} - Présent`;
}

function coupleKey(a, b) {
  const [minId, maxId] = [a, b].sort((x, y) => x - y);
  return `c-${minId}-${maxId}`;
}

function splitNameLines(name, maxWordsPerLine = 1) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  for (let i = 0; i < parts.length; i += maxWordsPerLine) {
    lines.push(parts.slice(i, i + maxWordsPerLine).join(' '));
  }
  return lines.length ? lines : [''];
}

function parseDateValue(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? Number.POSITIVE_INFINITY : ts;
}

function sortByBirthThenId(a, b) {
  const dateA = parseDateValue(a.birth_date);
  const dateB = parseDateValue(b.birth_date);
  if (dateA !== dateB) return dateA - dateB;
  return a.id - b.id;
}

function buildFamilies(nodes) {
  const families = new Map();

  for (const person of nodes) {
    if (!person.father_id && !person.mother_id) continue;

    const parentIds = [person.father_id, person.mother_id].filter(Boolean);
    const key = parentIds.length === 2 ? coupleKey(parentIds[0], parentIds[1]) : `s-${parentIds[0]}`;

    if (!families.has(key)) {
      families.set(key, { key, parent_ids: parentIds, children: [] });
    }
    families.get(key).children.push(person.id);
  }

  for (const person of nodes) {
    if (!person.spouse_id) continue;
    const key = coupleKey(person.id, person.spouse_id);
    if (!families.has(key)) {
      families.set(key, { key, parent_ids: [person.id, person.spouse_id], children: [] });
    }
  }

  families.forEach((family) => {
    family.children.sort((a, b) => a - b);
  });

  return Array.from(families.values());
}

function computeGenerations(nodesById) {
  const memo = new Map();

  function depth(personId, stack = new Set()) {
    if (memo.has(personId)) return memo.get(personId);
    if (stack.has(personId)) return 0;

    const person = nodesById.get(personId);
    if (!person) return 0;

    stack.add(personId);
    const parentDepths = [];
    if (person.father_id) parentDepths.push(depth(person.father_id, stack) + 1);
    if (person.mother_id) parentDepths.push(depth(person.mother_id, stack) + 1);
    stack.delete(personId);

    const value = parentDepths.length ? Math.max(...parentDepths) : 0;
    memo.set(personId, value);
    return value;
  }

  for (const id of nodesById.keys()) depth(id);

  let changed = true;
  while (changed) {
    changed = false;
    for (const person of nodesById.values()) {
      if (!person.spouse_id || !nodesById.has(person.spouse_id)) continue;
      const a = memo.get(person.id) || 0;
      const b = memo.get(person.spouse_id) || 0;
      const level = Math.max(a, b);
      if (a !== level) {
        memo.set(person.id, level);
        changed = true;
      }
      if (b !== level) {
        memo.set(person.spouse_id, level);
        changed = true;
      }
    }
  }

  return memo;
}

function computeSexMap(nodes) {
  const byId = new Map(nodes.map((p) => [p.id, p]));
  const map = new Map();

  for (const person of nodes) {
    const genderStr = (person.gender || person.sexe || '').toString().toLowerCase().trim();
    if (['m', 'h', 'homme', 'male', 'masculin'].includes(genderStr)) {
      map.set(person.id, 'male');
    } else if (['f', 'femme', 'female', 'feminin', 'féminin'].includes(genderStr)) {
      map.set(person.id, 'female');
    }
  }

  for (const person of nodes) {
    if (person.father_id && byId.has(person.father_id)) map.set(person.father_id, 'male');
    if (person.mother_id && byId.has(person.mother_id) && !map.has(person.mother_id)) map.set(person.mother_id, 'female');
  }

  return map;
}

function assignPositions(nodes, families) {
  const nodesById = new Map(nodes.map((p) => [p.id, p]));
  const generations = computeGenerations(nodesById);
  const sexMap = computeSexMap(nodes);

  const partnerMap = new Map();
  families.forEach((family) => {
    if (family.parent_ids.length !== 2) return;
    const [a, b] = family.parent_ids;
    if (!partnerMap.has(a)) partnerMap.set(a, new Set());
    if (!partnerMap.has(b)) partnerMap.set(b, new Set());
    partnerMap.get(a).add(b);
    partnerMap.get(b).add(a);
  });

  const levelMap = new Map();
  nodes.forEach((person) => {
    const level = generations.get(person.id) || 0;
    if (!levelMap.has(level)) levelMap.set(level, []);
    levelMap.get(level).push(person);
  });

  const sortedLevels = Array.from(levelMap.keys()).sort((a, b) => a - b);
  const positions = new Map();
  let maxWidth = 0;

  sortedLevels.forEach((level) => {
    const persons = levelMap.get(level).sort(sortByBirthThenId);
    const units = [];
    const placed = new Set();

    for (const person of persons) {
      if (placed.has(person.id)) continue;

      const partners = Array.from(partnerMap.get(person.id) || []);
      const partner = partners
        .map((id) => nodesById.get(id))
        .find((candidate) => candidate && !placed.has(candidate.id) && (generations.get(candidate.id) || 0) === level);

      if (partner) {
        const sexA = sexMap.get(person.id);
        const sexB = sexMap.get(partner.id);
        let leftNode = person;
        let rightNode = partner;

        if (sexA !== sexB) {
          if (sexB === 'male') {
            leftNode = partner;
            rightNode = person;
          }
        } else if (sortByBirthThenId(person, partner) > 0) {
          leftNode = partner;
          rightNode = person;
        }

        units.push({ type: 'couple', left: leftNode, right: rightNode });
        placed.add(person.id);
        placed.add(partner.id);
      } else {
        units.push({ type: 'single', person });
        placed.add(person.id);
      }
    }

    units.forEach((unit) => {
      const focusPeople = unit.type === 'couple' ? [unit.left, unit.right] : [unit.person];
      const parentXs = [];

      focusPeople.forEach((p) => {
        if (p.father_id && positions.has(p.father_id)) parentXs.push(positions.get(p.father_id).x);
        if (p.mother_id && positions.has(p.mother_id)) parentXs.push(positions.get(p.mother_id).x);
      });

      if (parentXs.length) {
        unit.idealX = parentXs.reduce((sum, value) => sum + value, 0) / parentXs.length;
        const parent1 = focusPeople[0].father_id || focusPeople[1]?.father_id || 'u1';
        const parent2 = focusPeople[0].mother_id || focusPeople[1]?.mother_id || 'u2';
        unit.parentGroupId = `${parent1}-${parent2}`;
      } else {
        unit.idealX = null;
        unit.parentGroupId = `none-${focusPeople.map((p) => p.id).join('-')}`;
      }

      unit.oldestBirth = Math.min(...focusPeople.map((p) => parseDateValue(p.birth_date)));
    });

    const groupsMap = new Map();
    units.forEach((unit) => {
      if (!groupsMap.has(unit.parentGroupId)) {
        groupsMap.set(unit.parentGroupId, { units: [], idealX: unit.idealX, oldestBirth: unit.oldestBirth });
      }
      const group = groupsMap.get(unit.parentGroupId);
      group.units.push(unit);
      group.oldestBirth = Math.min(group.oldestBirth, unit.oldestBirth);
    });

    const groups = Array.from(groupsMap.values());
    groups.forEach((group) => {
      const xs = group.units.map((u) => u.idealX).filter((x) => x !== null);
      if (xs.length) {
        group.idealX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
      }
      group.units.sort((a, b) => a.oldestBirth - b.oldestBirth);
    });

    const sortedGroups = groups.sort((a, b) => {
      if (a.idealX !== null && b.idealX !== null && a.idealX !== b.idealX) return a.idealX - b.idealX;
      if (a.idealX !== null) return -1;
      if (b.idealX !== null) return 1;
      return a.oldestBirth - b.oldestBirth;
    });

    let cursorX = SIDE_MARGIN;
    const y = TOP_MARGIN + level * GENERATION_HEIGHT;

    sortedGroups.forEach((group) => {
      const totalWidth = group.units.reduce((sum, u) => sum + (u.type === 'couple' ? COUPLE_WIDTH : SINGLE_WIDTH), 0)
        + Math.max(0, group.units.length - 1) * UNIT_SPACING;

      let startX = cursorX;
      if (group.idealX !== null) {
        const desired = group.idealX - totalWidth / 2;
        if (desired > startX) startX = desired;
      }

      let currentX = startX;
      group.units.forEach((unit) => {
        const widthNeeded = unit.type === 'couple' ? COUPLE_WIDTH : SINGLE_WIDTH;
        const centerX = currentX + widthNeeded / 2;

        if (unit.type === 'couple') {
          positions.set(unit.left.id, { x: centerX - COUPLE_GAP / 2, y });
          positions.set(unit.right.id, { x: centerX + COUPLE_GAP / 2, y });
        } else {
          positions.set(unit.person.id, { x: centerX, y });
        }

        currentX += widthNeeded + UNIT_SPACING;
      });

      cursorX = currentX + FAMILY_SPACING;
    });

    maxWidth = Math.max(maxWidth, cursorX + SIDE_MARGIN);
  });

  const maxLevel = sortedLevels.length ? Math.max(...sortedLevels) : 0;
  const height = TOP_MARGIN + (maxLevel + 1) * GENERATION_HEIGHT + 100;
  return { positions, width: Math.max(maxWidth, 1000), height };
}

function drawCoupleLinks(layer, families, positions) {
  families.forEach((family) => {
    if (family.parent_ids.length !== 2) return;

    const [aId, bId] = family.parent_ids;
    const a = positions.get(aId);
    const b = positions.get(bId);
    if (!a || !b) return;

    layer
      .append('line')
      .attr('x1', Math.min(a.x, b.x) + NODE_RADIUS + 6)
      .attr('y1', a.y)
      .attr('x2', Math.max(a.x, b.x) - NODE_RADIUS - 6)
      .attr('y2', b.y)
      .attr('stroke', '#6b7280')
      .attr('stroke-width', 2);

    layer
      .append('text')
      .attr('x', (a.x + b.x) / 2)
      .attr('y', (a.y + b.y) / 2 + 6)
      .attr('text-anchor', 'middle')
      .attr('font-size', 16)
      .attr('fill', '#ef4444')
      .text('♥');
  });
}

function drawFamilyConnectors(layer, families, positions, nodesById) {
  const familiesByLevel = new Map();

  families.forEach((family) => {
    if (!family.children.length) return;

    const children = family.children.map((id) => nodesById.get(id)).filter(Boolean).sort(sortByBirthThenId);
    family.children = children.map((child) => child.id);
    const level = children.length ? Math.round((positions.get(children[0].id)?.y || 0) / GENERATION_HEIGHT) : 0;

    if (!familiesByLevel.has(level)) familiesByLevel.set(level, []);
    familiesByLevel.get(level).push(family);
  });

  familiesByLevel.forEach((levelFamilies) => {
    levelFamilies.sort((fa, fb) => {
      const ax = fa.parent_ids.map((id) => positions.get(id)?.x || 0).reduce((sum, x) => sum + x, 0) / Math.max(1, fa.parent_ids.length);
      const bx = fb.parent_ids.map((id) => positions.get(id)?.x || 0).reduce((sum, x) => sum + x, 0) / Math.max(1, fb.parent_ids.length);
      return ax - bx;
    });

    levelFamilies.forEach((family, index) => {
      const parentPoints = family.parent_ids.map((id) => positions.get(id)).filter(Boolean);
      if (!parentPoints.length) return;

      const childrenPoints = family.children.map((id) => positions.get(id)).filter(Boolean);
      if (!childrenPoints.length) return;

      const parentAnchor = parentPoints.length === 2
        ? { x: (parentPoints[0].x + parentPoints[1].x) / 2, y: parentPoints[0].y }
        : { x: parentPoints[0].x, y: parentPoints[0].y };

      const minChildY = Math.min(...childrenPoints.map((p) => p.y));
      const laneOffset = index * CONNECTOR_LANE_STEP;
      const junctionY = minChildY - CONNECTOR_GAP - laneOffset;

      const minX = Math.min(parentAnchor.x, ...childrenPoints.map((p) => p.x));
      const maxX = Math.max(parentAnchor.x, ...childrenPoints.map((p) => p.x));
      const parentBottomY = parentAnchor.y + NODE_RADIUS + 6;

      layer
        .append('path')
        .attr('d', `M ${parentAnchor.x} ${parentBottomY} V ${junctionY}`)
        .attr('fill', 'none')
        .attr('stroke', '#9ca3af')
        .attr('stroke-width', 2);

      if (minX !== maxX) {
        layer
          .append('line')
          .attr('x1', minX)
          .attr('y1', junctionY)
          .attr('x2', maxX)
          .attr('y2', junctionY)
          .attr('stroke', '#9ca3af')
          .attr('stroke-width', 2);
      }

      childrenPoints.forEach((point) => {
        layer
          .append('line')
          .attr('x1', point.x)
          .attr('y1', junctionY)
          .attr('x2', point.x)
          .attr('y2', point.y - NODE_RADIUS - 4)
          .attr('stroke', '#9ca3af')
          .attr('stroke-width', 2);
      });
    });
  });
}

function drawPeople(layer, nodes, positions, onDrag, hoverHandlers) {
  const nodeGroups = layer
    .selectAll('g.person-node')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', 'person-node')
    .attr('transform', (d) => {
      const point = positions.get(d.id);
      return `translate(${point.x}, ${point.y})`;
    })
    .on('mouseenter', hoverHandlers.onEnter)
    .on('mousemove', hoverHandlers.onMove)
    .on('mouseleave', hoverHandlers.onLeave)
    .call(
      d3.drag().on('drag', function onDragged(event, d) {
        const point = positions.get(d.id);
        point.x = event.x;
        point.y = event.y;
        d3.select(this).attr('transform', `translate(${point.x}, ${point.y})`);
        onDrag();
      })
    );

  nodeGroups
    .append('circle')
    .attr('r', NODE_RADIUS)
    .attr('fill', '#fff')
    .attr('stroke-width', 3)
    .attr('stroke', (d) => (d.status === 'alive' ? '#2f855a' : '#9b2c2c'));

  nodeGroups
    .append('clipPath')
    .attr('id', (d) => `photo-clip-${d.id}`)
    .append('circle')
    .attr('r', PHOTO_RADIUS);

  nodeGroups
    .append('image')
    .attr('href', (d) => d.photo || PLACEHOLDER_PHOTO)
    .attr('x', -PHOTO_RADIUS)
    .attr('y', -PHOTO_RADIUS)
    .attr('width', PHOTO_RADIUS * 2)
    .attr('height', PHOTO_RADIUS * 2)
    .attr('clip-path', (d) => `url(#photo-clip-${d.id})`)
    .attr('preserveAspectRatio', 'xMidYMid slice');

  const nameText = nodeGroups
    .append('text')
    .attr('class', 'person-name')
    .attr('text-anchor', 'middle')
    .attr('fill', '#1f2937')
    .attr('font-size', 15)
    .attr('font-weight', 600)
    .attr('y', NODE_RADIUS + 18);

  nameText.each(function drawWrappedName(d) {
    const text = d3.select(this);
    const lines = splitNameLines(d.name);
    lines.forEach((line, index) => {
      text
        .append('tspan')
        .attr('x', 0)
        .attr('dy', index === 0 ? 0 : 16)
        .text(line);
    });
  });

  nodeGroups
    .append('text')
    .attr('class', 'person-dates')
    .attr('text-anchor', 'middle')
    .attr('fill', '#0ea5e9')
    .attr('font-size', 12)
    .attr('y', (d) => NODE_RADIUS + 18 + splitNameLines(d.name).length * 16 + 6)
    .text((d) => formatDates(d));
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function renderSvgToCanvas(svgElement, scaleFactor = 3) {
  return new Promise((resolve, reject) => {
    const serializer = new XMLSerializer();
    const clonedSvg = svgElement.cloneNode(true);

    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

    const bbox = svgElement.getBBox();
    const padding = 40;
    const width = Math.max(1000, bbox.width + padding * 2);
    const height = Math.max(700, bbox.height + padding * 2);

    clonedSvg.setAttribute('width', width);
    clonedSvg.setAttribute('height', height);
    clonedSvg.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`);

    const svgString = serializer.serializeToString(clonedSvg);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function onLoad() {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scaleFactor);
      canvas.height = Math.round(height * scaleFactor);

      const ctx = canvas.getContext('2d');
      ctx.setTransform(scaleFactor, 0, 0, scaleFactor, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      URL.revokeObjectURL(url);
      resolve(canvas);
    };

    img.onerror = function onError() {
      reject(new Error('Erreur conversion SVG'));
    };

    img.src = url;
  });
}

async function exportAsImage() {
  const svgElement = document.getElementById('tree-svg');
  const canvas = await renderSvgToCanvas(svgElement, 3);
  downloadCanvas(canvas, 'arbre-genealogique.png');
}

async function exportAsPdf() {
  const svgElement = document.getElementById('tree-svg');
  const canvas = await renderSvgToCanvas(svgElement, 3);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
  const width = canvas.width * ratio;
  const height = canvas.height * ratio;
  const x = (pageWidth - width) / 2;
  const y = (pageHeight - height) / 2;

  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, width, height, undefined, 'FAST');
  pdf.save('arbre-genealogique.pdf');
}

async function toBase64(url) {
  if (!url) return PLACEHOLDER_PHOTO;
  if (url.startsWith('data:')) return url;
  if (PHOTO_CACHE.has(url)) return PHOTO_CACHE.get(url);

  const response = await fetch(url);
  const blob = await response.blob();

  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  PHOTO_CACHE.set(url, dataUrl);
  return dataUrl;
}

async function fetchTreeData() {
  const response = await fetch('/api/arbre/', {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Chargement API impossible (${response.status})`);
  }

  const data = await response.json();

  await Promise.all(
    (data.nodes || []).map(async (person) => {
      if (!person.photo) {
        person.photo = PLACEHOLDER_PHOTO;
        return;
      }

      try {
        person.photo = await toBase64(person.photo);
      } catch {
        person.photo = PLACEHOLDER_PHOTO;
      }
    })
  );

  return data;
}

async function renderTree() {
  const localRenderVersion = ++renderVersion;
  const data = await fetchTreeData();
  if (localRenderVersion !== renderVersion) return;

  const svg = d3.select('#tree-svg');
  svg.selectAll('*').remove();

  const tooltip = document.getElementById('person-hover-card');
  const tooltipImage = document.getElementById('hover-image');
  const tooltipName = document.getElementById('hover-name');

  const families = buildFamilies(data.nodes);
  const { positions, width, height } = assignPositions(data.nodes, families);

  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);

  const rootGroup = svg.append('g');
  const linksLayer = rootGroup.append('g');
  const nodesLayer = rootGroup.append('g');
  const nodesById = new Map(data.nodes.map((node) => [node.id, node]));

  const redrawLinks = () => {
    linksLayer.selectAll('*').remove();
    drawCoupleLinks(linksLayer, families, positions);
    drawFamilyConnectors(linksLayer, families, positions, nodesById);
  };

  const hoverHandlers = {
    onEnter(event, person) {
      tooltipImage.src = person.photo || PLACEHOLDER_PHOTO;
      tooltipName.textContent = person.name || '';
      tooltip.classList.add('visible');
      this.dispatchEvent(new MouseEvent('mousemove', event));
    },
    onMove(event) {
      tooltip.style.left = `${event.pageX + 16}px`;
      tooltip.style.top = `${event.pageY + 16}px`;
    },
    onLeave() {
      tooltip.classList.remove('visible');
    },
  };

  redrawLinks();
  drawPeople(nodesLayer, data.nodes, positions, redrawLinks, hoverHandlers);

  svg.call(
    d3.zoom().scaleExtent([0.2, 3]).on('zoom', ({ transform }) => {
      rootGroup.attr('transform', transform);
    })
  );
}

function scheduleAutoRefresh() {
  setInterval(() => {
    renderTree().catch((error) => {
      console.error(error);
    });
  }, 12000);

  window.addEventListener('focus', () => {
    renderTree().catch((error) => {
      console.error(error);
    });
  });
}

document.getElementById('export-image').addEventListener('click', () => {
  exportAsImage().catch((error) => alert(error.message));
});

document.getElementById('export-pdf').addEventListener('click', () => {
  exportAsPdf().catch((error) => alert(error.message));
});

renderTree()
  .then(() => {
    scheduleAutoRefresh();
  })
  .catch((error) => {
    console.error(error);
    alert('Impossible de charger l’arbre.');
  });
