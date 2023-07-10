// https://observablehq.com/@d3/force-directed-tree@183
function _1(md) {
  return md`
## 汉语拼音字母组合树（后继图）

- 韵母字母（6 个）: a i e u ü o
- 声母字母（20 个）: n g; z c s h; r x y w; b p m f d t l k j q
  `;
}

const yunmuTable = ['a', 'i', 'e', 'u', 'ü', 'o'];

function _chart(d3, data, width, height, drag, invalidation) {
  // const root = d3.hierarchy(data);
  // const links = root.links();
  // const nodes = root.descendants();
  const links = data.map((d) => Object.create(d));
  const nodes = Array.from(
    new Set(data.flatMap((l) => [l.source, l.target])),
    (id) => ({ id, data: { name: id } })
  ).map((d) => Object.create(d));

  const simulation = d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(300)
        .strength(0.5)
    )
    .force('charge', d3.forceManyBody().strength(-380))
    .force('x', d3.forceX())
    .force('y', d3.forceY());

  const svg = d3
    .create('svg')
    .attr('viewBox', [-width / 2, -height / 2, width, height]);
  svg.call(dragGraph(d3, svg));

  const linkStroke = (l) =>
    !yunmuTable.includes(l.source.id) && !yunmuTable.includes(l.target.id)
      ? 'rgb(199, 53, 0)'
      : ['j', 'q', 'x'].includes(l.source.id) &&
        ['i', 'u'].includes(l.target.id)
      ? 'rgb(0, 138, 0)'
      : '#999';
  const linkHighlightStroke = 'rgb(184, 84, 80)';
  const link = svg
    .append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', linkStroke)
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0.6);

  const nodeFill = (d) =>
    yunmuTable.includes(d.data.name)
      ? 'rgb(225, 213, 231)'
      : 'rgb(255, 242, 204)';
  const nodeStroke = 'rgb(108, 142, 191)';
  const nodeHighlightFill = 'rgb(248, 206, 204)';
  const nodeHighlightStroke = 'rgb(184, 84, 80)';
  const node = svg
    .append('g')
    .attr('fill', '#fff')
    .attr('stroke-linecap', 'round')
    .attr('stroke-linejoin', 'round')
    .attr('style', 'cursor: pointer')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .call(drag(simulation));
  node
    .append('circle')
    .attr('stroke-width', 3)
    .attr('fill', nodeFill)
    .attr('stroke', nodeStroke)
    .attr('r', 18)
    .on('mouseenter', (evt, d) => {
      const matchedLinks = [];
      const matchedNodeIds = {};
      link.each((lnk) => {
        if (
          lnk.source.id === d.id
          //
          // || lnk.target.id === d.id
        ) {
          matchedLinks.push(lnk);
          matchedNodeIds[lnk.source.id] = matchedNodeIds[lnk.target.id] = true;
        }
      });

      link
        .attr('display', 'none')
        .filter((l) => matchedLinks.includes(l))
        .attr('display', 'block')
        .attr('stroke', linkHighlightStroke);

      node
        .selectAll('circle')
        .attr('stroke', nodeStroke)
        .filter((n) => matchedNodeIds[n.id])
        .attr('fill', nodeHighlightFill)
        .attr('stroke', nodeHighlightStroke);
    })
    .on('mouseleave', (evt) => {
      link.attr('display', 'block').attr('stroke', linkStroke);
      node
        .selectAll('circle')
        .attr('fill', nodeFill)
        .attr('stroke', nodeStroke);
    });
  node
    .append('text')
    .attr('x', -5)
    .attr('y', '0.31em')
    .text((d) => d.data.name)
    .attr('fill', '#000')
    .attr('stroke', '#000')
    .attr('style', 'pointer-events: none');

  simulation.on('tick', () => {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  invalidation.then(() => simulation.stop());

  return svg.node();
}

function _data(FileAttachment) {
  return FileAttachment('pinyin-tree.json').json();
}

function _height() {
  return 800;
}

function _drag(d3) {
  return (simulation) => {
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

    return d3
      .drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended);
  };
}

function dragGraph(d3, svg) {
  function dragstarted(event) {
    svg.node().style.cursor = 'move';
  }

  function dragged(event) {
    const viewBox = svg.node().viewBox.baseVal;
    const newViewBox = {
      x: viewBox.x - event.dx,
      y: viewBox.y - event.dy,
      width: viewBox.width,
      height: viewBox.height
    };

    updateSvgViewBox(svg, newViewBox);
  }

  function dragended(event) {
    svg.node().style.cursor = '';
  }

  return d3
    .drag()
    .on('start', dragstarted)
    .on('drag', dragged)
    .on('end', dragended);
}

function updateSvgViewBox(svg, viewBox) {
  svg.attr('viewBox', [viewBox.x, viewBox.y, viewBox.width, viewBox.height]);
}

function _d3(require) {
  return require('d3@6');
}

export function define(runtime, observer) {
  const main = runtime.module();
  function toString() {
    return this.url;
  }
  const fileAttachments = new Map([
    [
      'pinyin-tree.json',
      {
        url: new URL('./files/char-links.json', import.meta.url),
        mimeType: 'application/json',
        toString
      }
    ]
  ]);
  main.builtin(
    'FileAttachment',
    runtime.fileAttachments((name) => fileAttachments.get(name))
  );
  main.variable(observer()).define(['md'], _1);
  main
    .variable(observer('chart'))
    .define(
      'chart',
      ['d3', 'data', 'width', 'height', 'drag', 'invalidation'],
      _chart
    );
  main.variable(observer('data')).define('data', ['FileAttachment'], _data);
  main.variable(observer('height')).define('height', _height);
  main.variable(observer('drag')).define('drag', ['d3'], _drag);
  main.variable(observer('d3')).define('d3', ['require'], _d3);
  return main;
}
