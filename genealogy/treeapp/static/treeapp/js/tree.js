const NODE_RADIUS = 38;
const PHOTO_RADIUS = 33;
const SINGLE_WIDTH = 170;
const COUPLE_WIDTH = 330;
const GENERATION_HEIGHT = 220;
const TOP_MARGIN = 90;
const SIDE_MARGIN = 120;
const CONNECTOR_GAP = 84;
const PLACEHOLDER_PHOTO =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="%23e5e7eb"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="16" fill="%236b7280">Photo</text></svg>';

function formatDates(person) {
  return person.death_date
    ? `${person.birth_date} - ${person.death_date}`
    : `${person.birth_date} - Présent`;
}

function buildFamilies(nodes) {
  const families = new Map();

  for (const person of nodes) {
    if (!person.father_id && !person.mother_id) {
      continue;
    }

    const key = person.father_id && person.mother_id
      ? `c-${person.father_id}-${person.mother_id}`
      : `s-${person.father_id || person.mother_id}`;

    if (!families.has(key)) {
      families.set(key, {
        key,
        father_id: person.father_id,
        mother_id: person.mother_id,
        children: [],
      });
    }

    families.get(key).children.push(person.id);
  }

  return Array.from(families.values());
}

function computeGenerations(nodesById) {
  const memo = new Map();

  function depth(personId, stack = new Set()) {
    if (memo.has(personId)) {
      return memo.get(personId);
    }
    if (stack.has(personId)) {
      return 0;
    }

    const person = nodesById.get(personId);
    if (!person) {
      return 0;
    }

    stack.add(personId);
    const parentDepths = [];
    if (person.father_id) {
      parentDepths.push(depth(person.father_id, stack) + 1);
    }
    if (person.mother_id) {
      parentDepths.push(depth(person.mother_id, stack) + 1);
    }
    stack.delete(personId);

    const value = parentDepths.length ? Math.max(...parentDepths) : 0;
    memo.set(personId, value);
    return value;
  }

  for (const id of nodesById.keys()) {
    depth(id);
  }

  return memo;
}

function assignPositions(nodes, families) {
  const nodesById = new Map(nodes.map((p) => [p.id, p]));
  const generations = computeGenerations(nodesById);

  const familiesByMember = new Map();
  families.forEach((family) => {
    [family.father_id, family.mother_id].forEach((parentId) => {
      if (!parentId) return;
      if (!familiesByMember.has(parentId)) {
        familiesByMember.set(parentId, []);
      }
      familiesByMember.get(parentId).push(family);
    });
  });

  const levelMap = new Map();
  nodes.forEach((person) => {
    const level = generations.get(person.id) || 0;
    if (!levelMap.has(level)) {
      levelMap.set(level, []);
    }
    levelMap.get(level).push(person);
  });

  const sortedLevels = Array.from(levelMap.keys()).sort((a, b) => a - b);
  const placedFamilyKeys = new Set();
  const positions = new Map();
  let maxWidth = 1000;

  sortedLevels.forEach((level) => {
    const persons = levelMap.get(level).sort((a, b) => a.birth_date.localeCompare(b.birth_date));
    const units = [];

    for (const person of persons) {
      if (positions.has(person.id)) {
        continue;
      }

      const memberFamilies = (familiesByMember.get(person.id) || []).filter(
        (fam) => fam.father_id && fam.mother_id && !placedFamilyKeys.has(fam.key)
      );

      const family = memberFamilies[0];
      if (family) {
        const partnerId = family.father_id === person.id ? family.mother_id : family.father_id;
        const partner = nodesById.get(partnerId);
        if (partner && (generations.get(partner.id) || 0) === level && !positions.has(partner.id)) {
          units.push({ type: 'couple', left: person, right: partner, family });
          placedFamilyKeys.add(family.key);
          continue;
        }
      }

      units.push({ type: 'single', person });
    }

    let cursorX = SIDE_MARGIN;
    const y = TOP_MARGIN + level * GENERATION_HEIGHT;

    for (const unit of units) {
      if (unit.type === 'couple') {
        const centerX = cursorX + COUPLE_WIDTH / 2;
        positions.set(unit.left.id, { x: centerX - 80, y });
        positions.set(unit.right.id, { x: centerX + 80, y });
        unit.centerX = centerX;
        cursorX += COUPLE_WIDTH;
      } else {
        const centerX = cursorX + SINGLE_WIDTH / 2;
        positions.set(unit.person.id, { x: centerX, y });
        cursorX += SINGLE_WIDTH;
      }
    }

    maxWidth = Math.max(maxWidth, cursorX + SIDE_MARGIN);
  });

  const maxLevel = sortedLevels.length ? Math.max(...sortedLevels) : 0;
  const height = TOP_MARGIN + (maxLevel + 1) * GENERATION_HEIGHT + 120;

  return { positions, width: maxWidth, height };
}

function drawFamilyConnectors(layer, families, positions) {
  families.forEach((family) => {
    const parentPoints = [family.father_id, family.mother_id]
      .filter(Boolean)
      .map((id) => positions.get(id))
      .filter(Boolean);

    if (!parentPoints.length) {
      return;
    }

    const childrenPoints = family.children.map((id) => positions.get(id)).filter(Boolean);
    if (!childrenPoints.length) {
      return;
    }

    const parentAnchor = parentPoints.length === 2
      ? {
          x: (parentPoints[0].x + parentPoints[1].x) / 2,
          y: (parentPoints[0].y + parentPoints[1].y) / 2,
        }
      : { x: parentPoints[0].x, y: parentPoints[0].y };

    const junctionY = Math.min(...childrenPoints.map((point) => point.y)) - CONNECTOR_GAP;
    const minX = Math.min(...childrenPoints.map((point) => point.x));
    const maxX = Math.max(...childrenPoints.map((point) => point.x));

    const parentBottomY = parentAnchor.y + NODE_RADIUS + 8;

    layer
      .append('path')
      .attr('class', 'link-line')
      .attr('d', `M ${parentAnchor.x} ${parentBottomY} V ${junctionY} H ${(minX + maxX) / 2}`);

    if (minX !== maxX) {
      layer
        .append('line')
        .attr('class', 'link-line')
        .attr('x1', minX)
        .attr('y1', junctionY)
        .attr('x2', maxX)
        .attr('y2', junctionY);
    }

    childrenPoints.forEach((point) => {
      layer
        .append('line')
        .attr('class', 'link-line')
        .attr('x1', point.x)
        .attr('y1', junctionY)
        .attr('x2', point.x)
        .attr('y2', point.y - NODE_RADIUS - 6);
    });
  });
}

function drawCoupleLinks(layer, families, positions) {
  families.forEach((family) => {
    if (!family.father_id || !family.mother_id) return;
    const father = positions.get(family.father_id);
    const mother = positions.get(family.mother_id);
    if (!father || !mother) return;

    const y = father.y;
    layer
      .append('line')
      .attr('class', 'couple-line')
      .attr('x1', father.x + NODE_RADIUS + 8)
      .attr('y1', y)
      .attr('x2', mother.x - NODE_RADIUS - 8)
      .attr('y2', y);

    layer
      .append('text')
      .attr('x', (father.x + mother.x) / 2)
      .attr('y', y + 6)
      .attr('text-anchor', 'middle')
      .attr('font-size', 16)
      .attr('fill', '#3b82f6')
      .text('♥');
  });
}

function drawPeople(layer, nodes, positions) {
  const nodeGroups = layer
    .selectAll('g.person-node')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', 'person-node')
    .attr('transform', (d) => {
      const point = positions.get(d.id);
      return `translate(${point.x}, ${point.y})`;
    });

  nodeGroups
    .append('circle')
    .attr('r', NODE_RADIUS)
    .attr('class', (d) => `person-photo-frame ${d.status === 'alive' ? 'node-alive' : 'node-deceased'}`);

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

  nodeGroups
    .append('text')
    .attr('class', 'person-name')
    .attr('y', NODE_RADIUS + 24)
    .attr('text-anchor', 'middle')
    .text((d) => d.name);

  nodeGroups
    .append('text')
    .attr('class', 'person-dates')
    .attr('y', NODE_RADIUS + 44)
    .attr('text-anchor', 'middle')
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

  const families = buildFamilies(data.nodes);
  const { positions, width, height } = assignPositions(data.nodes, families);

  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);

  const rootGroup = svg.append('g');
  svg.call(
    d3.zoom().scaleExtent([0.2, 3]).on('zoom', ({ transform }) => {
      rootGroup.attr('transform', transform);
    })
  );

  const linksLayer = rootGroup.append('g');
  drawCoupleLinks(linksLayer, families, positions);
  drawFamilyConnectors(linksLayer, families, positions);

  const nodesLayer = rootGroup.append('g');
  drawPeople(nodesLayer, data.nodes, positions);
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
