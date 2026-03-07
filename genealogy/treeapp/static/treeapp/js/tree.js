const NODE_RADIUS = 30;
const PHOTO_RADIUS = 25;
const SINGLE_WIDTH = 120;
const COUPLE_WIDTH = 260; // 2 nodes + space
const GENERATION_HEIGHT = 220; // Plus vertical space
const TOP_MARGIN = 80;
const SIDE_MARGIN = 80;
const CONNECTOR_GAP = 80;
const PLACEHOLDER_PHOTO =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="%23e5e7eb"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="16" fill="%236b7280">Photo</text></svg>';

const STORAGE_KEY = 'genealogy_tree_positions';

function savePositions(posMap) {
  const obj = {};
  for (let [id, pos] of posMap.entries()) {
    obj[id] = pos;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

function loadPositions() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

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

// Fonction pour parser la date de naissance en objet Date (gère les formats YYYY ou YYYY-MM-DD)
function parseBirthDate(dateStr) {
  if (!dateStr) return new Date(9999, 11, 31); // Date future pour les inconnus
  const parts = dateStr.split('-').map(Number);
  if (parts.length === 1) return new Date(parts[0], 0, 1); // Année seulement
  if (parts.length === 2) return new Date(parts[0], parts[1] - 1, 1); // Année-Mois
  return new Date(parts[0], parts[1] - 1, parts[2]); // Année-Mois-Jour
}

function assignPositions(nodes, families) {
  const nodesById = new Map(nodes.map((p) => [p.id, p]));
  const generations = computeGenerations(nodesById);
  const positions = new Map();

  const savedObj = loadPositions();
  if (savedObj) {
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
       const pos = savedObj[n.id];
       if (pos) {
         positions.set(n.id, pos);
         minX = Math.min(minX, pos.x);
         maxX = Math.max(maxX, pos.x);
         maxY = Math.max(maxY, pos.y);
       }
    });
    if (positions.size > 0 && isFinite(maxX)) {
      const shiftX = SIDE_MARGIN - minX + 50;
      let finalMaxX = 0;
      for (let pos of positions.values()) {
        pos.x += shiftX;
        finalMaxX = Math.max(finalMaxX, pos.x);
      }
      return { positions, width: finalMaxX + SIDE_MARGIN + 100, height: maxY + 200 };
    }
  }

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
  let maxWidth = 0;
  
  // Placements initiaux très espacés
  sortedLevels.forEach((level) => {
    let persons = levelMap.get(level);
    persons.sort((a, b) => parseBirthDate(a.birth_date) - parseBirthDate(b.birth_date));

    const units = [];
    const placed = new Set();

    persons.forEach((person) => {
      if (placed.has(person.id)) return;
      const partners = Array.from(partnerMap.get(person.id) || []);
      const partner = partners
        .map((id) => nodesById.get(id))
        .find((candidate) => candidate && !placed.has(candidate.id) && (generations.get(candidate.id) || 0) === level);

      if (partner) {
        let leftNode = isMale(person) ? person : (isMale(partner) ? partner : person);
        let rightNode = leftNode === person ? partner : person;
        if (!isMale(person) && !isMale(partner) && parseBirthDate(person.birth_date) > parseBirthDate(partner.birth_date)) {
           leftNode = partner; rightNode = person;
        }
        units.push({ type: 'couple', left: leftNode, right: rightNode, nodes: [leftNode, rightNode] });
        placed.add(person.id);
        placed.add(partner.id);
      } else {
        units.push({ type: 'single', person, nodes: [person] });
        placed.add(person.id);
      }
    });

    // Determine families
    units.forEach((unit) => {
      let parentsX = [];
      unit.nodes.forEach(p => {
        if (p.father_id && positions.has(p.father_id)) parentsX.push(positions.get(p.father_id).x);
        if (p.mother_id && positions.has(p.mother_id)) parentsX.push(positions.get(p.mother_id).x);
      });
      unit.idealX = parentsX.length ? parentsX.reduce((a, b) => a + b, 0) / parentsX.length : null;
      unit.parentKey = unit.nodes[0].father_id + '-' + unit.nodes[0].mother_id;
    });

    const groupsMap = new Map();
    units.forEach((unit) => {
      if (!groupsMap.has(unit.parentKey)) groupsMap.set(unit.parentKey, { units: [], idealX: unit.idealX });
      groupsMap.get(unit.parentKey).units.push(unit);
    });

    const sortedGroups = Array.from(groupsMap.values()).sort((a, b) => (a.idealX || 0) - (b.idealX || 0));

    let cursorX = SIDE_MARGIN;
    const y = TOP_MARGIN + level * GENERATION_HEIGHT;
    const UNIT_SPACING = 60;
    const FAMILY_SPACING = 150;

    sortedGroups.forEach((group) => {
      group.units.sort((a, b) => parseBirthDate(a.nodes[0].birth_date) - parseBirthDate(b.nodes[0].birth_date));
      let startX = cursorX;
      if (group.idealX !== null && group.idealX > cursorX + 50) {
         startX = group.idealX;
      }
      
      let currentX = startX;
      group.units.forEach((unit) => {
        const widthNeeded = unit.type === 'couple' ? COUPLE_WIDTH : SINGLE_WIDTH;
        if (unit.type === 'couple') {
          positions.set(unit.left.id, { x: currentX + 30, y });
          positions.set(unit.right.id, { x: currentX + widthNeeded - 30, y });
        } else {
          positions.set(unit.person.id, { x: currentX + widthNeeded / 2, y });
        }
        currentX += widthNeeded + UNIT_SPACING;
      });
      cursorX = currentX + FAMILY_SPACING;
    });
    maxWidth = Math.max(maxWidth, cursorX + SIDE_MARGIN);
  });

  // Post-pass: Bottom-Up Parent Centering
  for (let i = sortedLevels.length - 1; i >= 0; i--) {
     const lvl = sortedLevels[i];
     const personsInLevel = levelMap.get(lvl);
     const processedCouples = new Set();

     personsInLevel.forEach(p => {
        const partners = Array.from(partnerMap.get(p.id) || []);
        let partnerId = partners.length ? partners[0] : null;

        const coupleKeyId = partnerId ? coupleKey(p.id, partnerId) : p.id;
        if (processedCouples.has(coupleKeyId)) return;
        processedCouples.add(coupleKeyId);

        const children = nodes.filter(n => 
           n.father_id === p.id || n.mother_id === p.id ||
           (partnerId && (n.father_id === partnerId || n.mother_id === partnerId))
        );

        if (children.length > 0) {
            const childXs = children.map(c => positions.get(c.id)?.x).filter(x => x !== undefined);
            if (childXs.length > 0) {
               const avgX = childXs.reduce((a,b)=>a+b, 0) / childXs.length;
               if (partnerId && positions.has(p.id) && positions.has(partnerId)) {
                   const oldP1 = positions.get(p.id).x;
                   const oldP2 = positions.get(partnerId).x;
                   const diff = avgX - ((oldP1 + oldP2) / 2);
                   positions.get(p.id).x += diff;
                   positions.get(partnerId).x += diff;
               } else if (positions.has(p.id)) {
                   positions.get(p.id).x = avgX;
               }
            }
        }
     });
  }

  // Final Pass: Ensure no horizontal overlaps by shifting right
  // Very simplistic: just sort by X globally and ensure minimum spacing
  const allNodes = Array.from(positions.entries()).sort((a,b)=> a[1].x - b[1].x);
  // Actually, to avoid destroying parent-child relations, we won't flatten it perfectly.
  // The wide margins and spacing usually suffice. If not, user can drag and save.

  const maxLevel = sortedLevels.length ? Math.max(...sortedLevels) : 0;
  const height = TOP_MARGIN + (maxLevel + 1) * GENERATION_HEIGHT + 100;

  // recompute maxWidth
  for (const pos of positions.values()) {
      maxWidth = Math.max(maxWidth, pos.x + SIDE_MARGIN + 100);
  }

  savePositions(positions);
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
  // Trier les familles par position X moyenne des parents pour assigner des offsets séquentiels
  const sortedFamilies = families.slice().sort((a, b) => {
    const aX = a.parent_ids.map(id => positions.get(id)?.x || 0).reduce((sum, x) => sum + x, 0) / a.parent_ids.length;
    const bX = b.parent_ids.map(id => positions.get(id)?.x || 0).reduce((sum, x) => sum + x, 0) / b.parent_ids.length;
    return aX - bX;
  });

  sortedFamilies.forEach((family, index) => {
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

    // Offset plus grand et basé sur index pour éviter tout chevauchement
    const yOffset = index * 25; // Augmenté pour plus de séparation
    
    // The junction Y should ideally stay horizontal relative to the original generation spacing, 
    // or at least be below the parent and above the highest child (or just fixed distance below parent).
    // Let's attach the junction to fixed distance below the parentAnchor to prevent the horizontal line 
    // from moving wildly when dragging one child.
    const parentBottomY = parentAnchor.y + NODE_RADIUS + 6;
    const junctionY = parentBottomY + CONNECTOR_GAP + yOffset; 

    const allXCoordinates = [parentAnchor.x, ...childrenPoints.map((p) => p.x)];
    const minX = Math.min(...allXCoordinates);
    const maxX = Math.max(...allXCoordinates);

    // Vertical line from parent to the horizontal junction street
    layer
      .append('path')
      .attr('d', `M ${parentAnchor.x} ${parentBottomY} V ${junctionY}`)
      .attr('fill', 'none')
      .attr('stroke', '#9ca3af')
      .attr('stroke-width', 2);

    // Horizontal street connecting all children's vertical drop lines
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

    // Vertical lines dropping from horizontal street to each child
    childrenPoints.forEach((point) => {
      // If the child is dragged ABOVE the junction, the line would go up.
      // We just draw from junctionY to the child's top boundary.
      const childTopY = point.y - NODE_RADIUS - 4;
      layer
        .append('line')
        .attr('x1', point.x)
        .attr('y1', junctionY)
        .attr('x2', point.x)
        .attr('y2', childTopY)
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
        
        savePositions(positions);
        
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

function renderSvgToCanvas(svgElement, scale = 2) { // Ajout d'un scale pour meilleure résolution
  return new Promise((resolve, reject) => {
    const serializer = new XMLSerializer();
    const clonedSvg = svgElement.cloneNode(true);

    // Ajouter namespaces
    clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clonedSvg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

    const bbox = svgElement.getBBox();

    const padding = 40;
    const width = (bbox.width + padding * 2) * scale;
    const height = (bbox.height + padding * 2) * scale;

    clonedSvg.setAttribute("width", width / scale);
    clonedSvg.setAttribute("height", height / scale);
    clonedSvg.setAttribute(
      "viewBox",
      `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`
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

      ctx.drawImage(img, 0, 0, width, height);

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
  const canvas = await renderSvgToCanvas(svgElement, 2); // Résolution doublée pour meilleur zoom
  downloadCanvas(canvas, 'arbre-genealogique.png');
}

async function exportAsPdf() {
  const svg = document.getElementById('tree-svg');
  if (!svg) return;

  // Let's get the real bounding box of the tree to export exactly what exists
  // We use a temporary clone or the original tree's layer bounding box
  const gLayer = svg.querySelector('g'); // The root zoom group
  let bbox = null;
  try {
     bbox = gLayer.getBBox();
  } catch(e) {
     bbox = { x: 0, y: 0, width: 2000, height: 1000 };
  }
  
  // Padding around the tree
  const padding = 50;
  const width = bbox.width + padding * 2;
  const height = bbox.height + padding * 2;
  const offsetX = bbox.x - padding;
  const offsetY = bbox.y - padding;

  const payload = {
    width, height,
    nodes: [],
    links: [],
    texts: []
  };

  const gGroups = svg.querySelectorAll('g.person-node');
  gGroups.forEach(g => {
     const transform = g.getAttribute('transform');
     if (!transform) return;
     const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
     if (match) {
        const x = parseFloat(match[1]) - offsetX;
        const y = parseFloat(match[2]) - offsetY;
        const circle = g.querySelector('circle[r="30"]');
        const statusColor = circle ? circle.getAttribute('stroke') : '#2f855a';
        
        const photoImg = g.querySelector('image');
        const photo = photoImg ? photoImg.getAttribute('href') : null;
        
        const nameLines = Array.from(g.querySelectorAll('text.person-name tspan')).map(t => t.textContent);
        const datesText = g.querySelector('text.person-dates')?.textContent;
        
        payload.nodes.push({ x, y, statusColor, photo, r: NODE_RADIUS, photo_r: PHOTO_RADIUS, name_lines: nameLines, dates: datesText });
     }
  });

  const lines = svg.querySelectorAll('line');
  lines.forEach(l => {
     payload.links.push({
       x1: parseFloat(l.getAttribute('x1')) - offsetX, 
       y1: parseFloat(l.getAttribute('y1')) - offsetY,
       x2: parseFloat(l.getAttribute('x2')) - offsetX, 
       y2: parseFloat(l.getAttribute('y2')) - offsetY,
       color: l.getAttribute('stroke') || '#9ca3af',
       width: l.getAttribute('stroke-width') || 2
     });
  });

  const paths = svg.querySelectorAll('path');
  paths.forEach(p => {
     // Our paths are simple M x y V y2. Let's convert them to lines for PDF
     const d = p.getAttribute('d');
     if (d && d.startsWith('M')) {
         const parts = d.split(' ');
         if (parts.length >= 4 && parts[3] === 'V') {
             payload.links.push({
                 x1: parseFloat(parts[1]) - offsetX, 
                 y1: parseFloat(parts[2]) - offsetY,
                 x2: parseFloat(parts[1]) - offsetX, 
                 y2: parseFloat(parts[4]) - offsetY,
                 color: p.getAttribute('stroke') || '#9ca3af',
                 width: p.getAttribute('stroke-width') || 2
             });
         }
     }
  });

  const texts = svg.querySelectorAll('text:not(.person-name):not(.person-dates)');
  texts.forEach(t => {
      payload.texts.push({
         x: parseFloat(t.getAttribute('x')) - offsetX,
         y: parseFloat(t.getAttribute('y')) - offsetY,
         text: t.textContent,
         color: t.getAttribute('fill') || '#ef4444',
         size: t.getAttribute('font-size') || 16
      });
  });

  try {
     const res = await fetch('/api/export-pdf/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
     });
     if (!res.ok) throw new Error('Error generated PDF');
     const blob = await res.blob();
     const url = window.URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = 'arbre-genealogique.pdf';
     document.body.appendChild(a);
     a.click();
     a.remove();
     window.URL.revokeObjectURL(url);
  } catch (err) {
     alert(err.message);
  }
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
  // Utilisation de XMLHttpRequest pour AJAX (comme demandé, bien que fetch soit moderne)
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/arbre/', true);
  xhr.onreadystatechange = async function () {
    if (xhr.readyState === 4 && xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);

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
    } else if (xhr.readyState === 4) {
      alert('Impossible de charger l’arbre.');
    }
  };
  xhr.send();
}

document.getElementById('export-image').addEventListener('click', () => {
  exportAsImage().catch((error) => alert(error.message));
});

document.getElementById('export-pdf').addEventListener('click', () => {
  exportAsPdf().catch((error) => alert(error.message));
});

document.getElementById('reset-layout')?.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
});

renderTree();