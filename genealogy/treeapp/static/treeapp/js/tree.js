const NODE_RADIUS = 38;
const PHOTO_RADIUS = 33;
const SINGLE_WIDTH = 190;
const COUPLE_WIDTH = 350;
const GENERATION_HEIGHT = 220;
const TOP_MARGIN = 90;
const SIDE_MARGIN = 140;
const CONNECTOR_GAP = 84;
const MIN_NODE_SPACING = 220;
const PARTNER_GAP = 160;
const PLACEHOLDER_PHOTO =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="%23e5e7eb"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="16" fill="%236b7280">Photo</text></svg>';

function formatDates(person) {
  return person.death_date ? `${person.birth_date} - ${person.death_date}` : `${person.birth_date} - Présent`;
}

function coupleKey(a, b) {
  const [minId, maxId] = [a, b].sort((x, y) => x - y);
  return `c-${minId}-${maxId}`;
}

function splitNameLines(name, maxWordsPerLine = 2) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  for (let i = 0; i < parts.length; i += maxWordsPerLine) {
    lines.push(parts.slice(i, i + maxWordsPerLine).join(' '));
  }
  return lines.length ? lines : [''];
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

function centerParentsOverChildren(families, positions) {
  families.forEach((family) => {
    if (family.parent_ids.length !== 2 || !family.children.length) return;

    const [aId, bId] = family.parent_ids;
    const a = positions.get(aId);
    const b = positions.get(bId);
    if (!a || !b) return;

    const childrenPoints = family.children.map((id) => positions.get(id)).filter(Boolean);
    if (!childrenPoints.length) return;

    const centerX = childrenPoints.reduce((sum, point) => sum + point.x, 0) / childrenPoints.length;
    a.x = centerX - PARTNER_GAP / 2;
    b.x = centerX + PARTNER_GAP / 2;

    if (family.children.length === 1) {
      childrenPoints[0].x = centerX;
    }
  });
}

function avoidOverlapByLevel(nodes, generations, positions) {
  const levels = new Map();
  for (const person of nodes) {
    const level = generations.get(person.id) || 0;
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(person.id);
  }

  for (const ids of levels.values()) {
    const ordered = ids.sort((a, b) => positions.get(a).x - positions.get(b).x);
    let previousX = -Infinity;

    for (const id of ordered) {
      const point = positions.get(id);
      if (!point) continue;
      if (point.x < previousX + MIN_NODE_SPACING) {
        point.x = previousX + MIN_NODE_SPACING;
      }
      previousX = point.x;
    }
  }
}

function assignPositions(nodes, families) {
  const nodesById = new Map(nodes.map((p) => [p.id, p]));
  const generations = computeGenerations(nodesById);

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

  sortedLevels.forEach((level) => {
    const persons = levelMap.get(level).sort((a, b) => a.birth_date.localeCompare(b.birth_date));
    const placed = new Set();
    const units = [];

    for (const person of persons) {
      if (placed.has(person.id)) continue;

      const partners = Array.from(partnerMap.get(person.id) || []);
      const partner = partners
        .map((id) => nodesById.get(id))
        .find((candidate) => candidate && !placed.has(candidate.id) && (generations.get(candidate.id) || 0) === level);

      if (partner) {
        units.push({ type: 'couple', left: person, right: partner });
        placed.add(person.id);
        placed.add(partner.id);
      } else {
        units.push({ type: 'single', person });
        placed.add(person.id);
      }
    }

    let cursorX = SIDE_MARGIN;
    const y = TOP_MARGIN + level * GENERATION_HEIGHT;

    for (const unit of units) {
      if (unit.type === 'couple') {
        const centerX = cursorX + COUPLE_WIDTH / 2;
        positions.set(unit.left.id, { x: centerX - PARTNER_GAP / 2, y });
        positions.set(unit.right.id, { x: centerX + PARTNER_GAP / 2, y });
        cursorX += COUPLE_WIDTH;
      } else {
        const centerX = cursorX + SINGLE_WIDTH / 2;
        positions.set(unit.person.id, { x: centerX, y });
        cursorX += SINGLE_WIDTH;
      }
    }
  });

  centerParentsOverChildren(families, positions);
  avoidOverlapByLevel(nodes, generations, positions);

  const allX = Array.from(positions.values()).map((p) => p.x);
  const minX = allX.length ? Math.min(...allX) : 0;
  if (minX < SIDE_MARGIN) {
    const shift = SIDE_MARGIN - minX;
    positions.forEach((point) => {
      point.x += shift;
    });
  }

  const maxX = Array.from(positions.values()).reduce((max, point) => Math.max(max, point.x), 1000);
  const maxLevel = sortedLevels.length ? Math.max(...sortedLevels) : 0;
  const width = maxX + SIDE_MARGIN;
  const height = TOP_MARGIN + (maxLevel + 1) * GENERATION_HEIGHT + 120;
  return { positions, width, height };
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
      .attr('x1', Math.min(a.x, b.x) + NODE_RADIUS + 8)
      .attr('y1', a.y)
      .attr('x2', Math.max(a.x, b.x) - NODE_RADIUS - 8)
      .attr('y2', b.y)
      .attr('stroke', '#6b7280')
      .attr('stroke-width', 2);

    layer
      .append('text')
      .attr('x', (a.x + b.x) / 2)
      .attr('y', (a.y + b.y) / 2 + 6)
      .attr('text-anchor', 'middle')
      .attr('font-size', 16)
      .attr('fill', '#3b82f6')
      .text('♥');
  });
}

function drawFamilyConnectors(layer, families, positions) {
  families.forEach((family) => {
    if (!family.children.length) return;

    const parentPoints = family.parent_ids.map((id) => positions.get(id)).filter(Boolean);
    if (!parentPoints.length) return;

    const childrenPoints = family.children.map((id) => positions.get(id)).filter(Boolean);
    if (!childrenPoints.length) return;

    const parentAnchor = parentPoints.length === 2
      ? {
          x: (parentPoints[0].x + parentPoints[1].x) / 2,
          y: (parentPoints[0].y + parentPoints[1].y) / 2,
        }
      : { x: parentPoints[0].x, y: parentPoints[0].y };

    const junctionY = Math.min(...childrenPoints.map((p) => p.y)) - CONNECTOR_GAP;
    const minX = Math.min(...childrenPoints.map((p) => p.x));
    const maxX = Math.max(...childrenPoints.map((p) => p.x));
    const parentBottomY = parentAnchor.y + NODE_RADIUS + 8;

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
        .attr('y2', point.y - NODE_RADIUS - 6)
        .attr('stroke', '#9ca3af')
        .attr('stroke-width', 2);
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
    .attr('stroke-width', 4)
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
    .attr('font-size', 17)
    .attr('font-weight', 600)
    .attr('y', NODE_RADIUS + 22);

  nameText.each(function drawWrappedName(d) {
    const text = d3.select(this);
    const lines = splitNameLines(d.name);
    lines.forEach((line, index) => {
      text
        .append('tspan')
        .attr('x', 0)
        .attr('dy', index === 0 ? 0 : 18)
        .text(line);
    });
  });

  nodeGroups
    .append('text')
    .attr('class', 'person-dates')
    .attr('text-anchor', 'middle')
    .attr('fill', '#0ea5e9')
    .attr('font-size', 13)
    .attr('y', (d) => NODE_RADIUS + 22 + splitNameLines(d.name).length * 18 + 8)
    .text((d) => formatDates(d));
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function renderSvgToCanvas(svgElement) {
  return new Promise((resolve, reject) => {
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgElement);
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = svgElement.viewBox.baseVal.width;
      canvas.height = svgElement.viewBox.baseVal.height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('Impossible de préparer l’export de l’image.'));
    img.src = url;
  });
}

async function exportAsImage() {
  const svgElement = document.getElementById('tree-svg');
  const canvas = await renderSvgToCanvas(svgElement);
  downloadCanvas(canvas, 'arbre-genealogique.png');
}

async function exportAsPdf() {
  const svgElement = document.getElementById('tree-svg');
  const canvas = await renderSvgToCanvas(svgElement);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
  const width = canvas.width * ratio;
  const height = canvas.height * ratio;
  const x = (pageWidth - width) / 2;
  const y = (pageHeight - height) / 2;

  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, width, height);
  pdf.save('arbre-genealogique.pdf');
}

async function renderTree() {
  const response = await fetch('/api/arbre/');
  const data = await response.json();

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

  const redrawLinks = () => {
    linksLayer.selectAll('*').remove();
    drawCoupleLinks(linksLayer, families, positions);
    drawFamilyConnectors(linksLayer, families, positions);
  };

  const hoverHandlers = {
    onEnter(event, person) {
      tooltipImage.src = person.photo || PLACEHOLDER_PHOTO;
      tooltipName.textContent = person.name;
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

document.getElementById('export-image').addEventListener('click', () => {
  exportAsImage().catch((error) => alert(error.message));
});

document.getElementById('export-pdf').addEventListener('click', () => {
  exportAsPdf().catch((error) => alert(error.message));
});

renderTree().catch((error) => {
  console.error(error);
  alert('Impossible de charger l’arbre.');
});
