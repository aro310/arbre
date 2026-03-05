async function renderTree() {
  const response = await fetch('/api/arbre/');
  const data = await response.json();

  const svg = d3.select('#tree-svg');
  svg.selectAll('*').remove();

  const width = document.getElementById('tree-svg').clientWidth;
  const height = 700;

  const rootGroup = svg.append('g');
  svg.call(
    d3.zoom().scaleExtent([0.2, 3]).on('zoom', ({ transform }) => {
      rootGroup.attr('transform', transform);
    })
  );

  const simulation = d3
    .forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.links).id((d) => d.id).distance(120))
    .force('charge', d3.forceManyBody().strength(-600))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(60));

  const link = rootGroup
    .append('g')
    .selectAll('line')
    .data(data.links)
    .enter()
    .append('line')
    .attr('stroke', '#94a3b8')
    .attr('stroke-width', 2);

  const node = rootGroup
    .append('g')
    .selectAll('g')
    .data(data.nodes)
    .enter()
    .append('g')
    .call(
      d3
        .drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
    );

  node
    .append('rect')
    .attr('x', -45)
    .attr('y', -20)
    .attr('width', 90)
    .attr('height', 40)
    .attr('rx', 8)
    .attr('class', (d) => `node-card ${d.status === 'alive' ? 'node-alive' : 'node-deceased'}`);

  node
    .append('text')
    .text((d) => d.name)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', 12);

  node.append('title').text((d) => {
    const dates = d.death_date
      ? `${d.birth_date} → ${d.death_date}`
      : `Né(e) le ${d.birth_date}`;
    return `${d.name}\n${dates}\n${d.status === 'alive' ? 'Vivant' : 'Décédé'}`;
  });

  simulation.on('tick', () => {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
}

renderTree();
