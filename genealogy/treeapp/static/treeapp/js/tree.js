const NODE_RADIUS = 30;
const PHOTO_RADIUS = 25;
const SINGLE_WIDTH = 140;
const COUPLE_WIDTH = 280;
const GENERATION_HEIGHT = 180;
const TOP_MARGIN = 50;
const SIDE_MARGIN = 60;
const CONNECTOR_GAP = 60;
const PLACEHOLDER_PHOTO =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="%23e5e7eb"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="16" fill="%236b7280">Photo</text></svg>';

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

// Fonction utilitaire pour vérifier si une personne est un homme (insensible à la casse)
function isMale(person) {
  if (!person) return false;
  const genderStr = (person.gender || person.sexe || '').toString().toLowerCase().trim();
  return ['m', 'h', 'homme', 'male', 'masculin'].includes(genderStr);
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
  let maxWidth = 0;

  sortedLevels.forEach((level) => {
    const persons = levelMap.get(level);
    const units = [];
    const placed = new Set();

    // 1. Définir les unités (Couples ou Célibataires)
    persons.forEach((person) => {
      if (placed.has(person.id)) return;
      const partners = Array.from(partnerMap.get(person.id) || []);
      const partner = partners
        .map((id) => nodesById.get(id))
        .find((candidate) => candidate && !placed.has(candidate.id) && (generations.get(candidate.id) || 0) === level);

      if (partner) {
        // Déterminer qui est l'homme pour le placer à gauche en utilisant notre nouvelle fonction robuste
        const isPersonMale = isMale(person);
        const isPartnerMale = isMale(partner);

        let leftNode, rightNode;
        if (isPersonMale && !isPartnerMale) {
          leftNode = person;
          rightNode = partner;
        } else if (isPartnerMale && !isPersonMale) {
          leftNode = partner;
          rightNode = person;
        } else {
          // Fallback si les deux sont de même sexe ou inconnus : placer le premier à gauche
          leftNode = person;
          rightNode = partner;
        }

        units.push({ type: 'couple', left: leftNode, right: rightNode });
        placed.add(person.id);
        placed.add(partner.id);
      } else {
        units.push({ type: 'single', person });
        placed.add(person.id);
      }
    });

    // 2. Assigner un "parentGroupId" pour que les frères et sœurs restent collés
    units.forEach((unit) => {
      let parentsX = [];
      let p1 = unit.type === 'couple' ? unit.left : unit.person;
      let p2 = unit.type === 'couple' ? unit.right : null;

      [p1, p2].filter(Boolean).forEach((p) => {
        if (p.father_id && positions.has(p.father_id)) parentsX.push(positions.get(p.father_id).x);
        if (p.mother_id && positions.has(p.mother_id)) parentsX.push(positions.get(p.mother_id).x);
      });

      if (parentsX.length > 0) {
        unit.idealX = parentsX.reduce((a, b) => a + b, 0) / parentsX.length;
        const parent1 = p1.father_id || p2?.father_id || 'u1';
        const parent2 = p1.mother_id || p2?.mother_id || 'u2';
        unit.parentGroupId = `${parent1}-${parent2}`;
      } else {
        unit.idealX = null;
        unit.parentGroupId = `none-${Math.random()}`; // Les unités sans parents sont indépendantes
      }
    });

    // 3. Créer des groupes familiaux (Fratries)
    const groupsMap = new Map();
    units.forEach((unit) => {
      if (!groupsMap.has(unit.parentGroupId)) {
        groupsMap.set(unit.parentGroupId, { units: [], idealX: unit.idealX });
      }
      groupsMap.get(unit.parentGroupId).units.push(unit);
    });

    // Calculer l'axe idéal moyen pour tout le groupe
    Array.from(groupsMap.values()).forEach(group => {
      const validX = group.units.map(u => u.idealX).filter(x => x !== null);
      if(validX.length > 0) {
        group.idealX = validX.reduce((a, b) => a + b, 0) / validX.length;
      }
    });

    // 4. Trier les groupes (ceux avec parents en premier, pour s'aligner sous eux)
    const sortedGroups = Array.from(groupsMap.values()).sort((a, b) => {
      if (a.idealX !== null && b.idealX !== null) return a.idealX - b.idealX;
      if (a.idealX !== null) return -1;
      if (b.idealX !== null) return 1;
      return 0;
    });

    // 5. Placement définitif sur l'axe X
    let cursorX = SIDE_MARGIN;
    const y = TOP_MARGIN + level * GENERATION_HEIGHT;
    const UNIT_SPACING = 10; // Espace entre frères/sœurs
    const FAMILY_SPACING = 50; // Espace plus large entre différentes familles

    sortedGroups.forEach((group) => {
      const totalWidth = group.units.reduce((sum, u) => sum + (u.type === 'couple' ? COUPLE_WIDTH : SINGLE_WIDTH) + UNIT_SPACING, 0) - UNIT_SPACING;

      let startX = cursorX;
      if (group.idealX !== null) {
        const desiredStart = group.idealX - (totalWidth / 2); // Tenter de centrer tout le bloc
        if (desiredStart > cursorX) {
          startX = desiredStart;
        }
      }

      let currentX = startX;
      group.units.forEach((unit) => {
        const widthNeeded = unit.type === 'couple' ? COUPLE_WIDTH : SINGLE_WIDTH;
        const centerX = currentX + widthNeeded / 2;

        if (unit.type === 'couple') {
          positions.set(unit.left.id, { x: centerX - 70, y });
          positions.set(unit.right.id, { x: centerX + 70, y });
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
  return { positions, width: maxWidth, height };
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

function drawFamilyConnectors(layer, families, positions) {
  families.forEach((family, index) => {
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

    const yOffset = (index % 4) * 20; 
    const junctionY = Math.min(...childrenPoints.map((p) => p.y)) - CONNECTOR_GAP + yOffset;
    
    const allXCoordinates = [parentAnchor.x, ...childrenPoints.map((p) => p.x)];
    const minX = Math.min(...allXCoordinates);
    const maxX = Math.max(...allXCoordinates);
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
}

function drawPeople(layer, nodes, positions, onDrag) {
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

function renderSvgToCanvas(svgElement) {
  return new Promise((resolve, reject) => {

    const serializer = new XMLSerializer();
    const clonedSvg = svgElement.cloneNode(true);

    // ajouter namespace
    clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clonedSvg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

    const bbox = svgElement.getBBox();

    const padding = 40;
    const width = bbox.width + padding * 2;
    const height = bbox.height + padding * 2;

    clonedSvg.setAttribute("width", width);
    clonedSvg.setAttribute("height", height);
    clonedSvg.setAttribute(
      "viewBox",
      `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`
    );

    const svgString = serializer.serializeToString(clonedSvg);
    const svgBlob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8"
    });

    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = function () {

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(img, 0, 0);

      URL.revokeObjectURL(url);

      resolve(canvas);
    };

    img.onerror = function () {
      reject(new Error("Erreur conversion SVG"));
    };

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

async function toBase64(url) {
  const res = await fetch(url);
  const blob = await res.blob();

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function renderTree() {
  const response = await fetch('/api/arbre/');
  const data = await response.json();

  // 🔵 Conversion des photos en base64
  for (const person of data.nodes) {
    if (person.photo) {
      try {
        person.photo = await toBase64(person.photo);
      } catch (e) {
        console.warn("Image non chargée", person.photo);
        person.photo = PLACEHOLDER_PHOTO;
      }
    }
  }

  const svg = d3.select('#tree-svg');
  svg.selectAll('*').remove();

  const families = buildFamilies(data.nodes);
  const { positions, width, height } = assignPositions(data.nodes, families);

  svg
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('height', height);

  const rootGroup = svg.append('g');
  const linksLayer = rootGroup.append('g');
  const nodesLayer = rootGroup.append('g');

  const redrawLinks = () => {
    linksLayer.selectAll('*').remove();
    drawCoupleLinks(linksLayer, families, positions);
    drawFamilyConnectors(linksLayer, families, positions);
  };

  redrawLinks();
  drawPeople(nodesLayer, data.nodes, positions, redrawLinks);

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