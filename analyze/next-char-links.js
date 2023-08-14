function _1(md) {
  return md`
## 汉语拼音字母后继树
  `;
}

function _chart(d3, data) {
  const width = window.innerWidth;

  const levelNodeFill = {
    0: 'rgb(157, 23, 77)',
    1: 'rgb(21, 94, 117)',
    2: 'rgb(91, 33, 182)'
  };
  const nodeFill = (d) =>
    d._children || d.children
      ? d.data.name
        ? levelNodeFill[d.data.level]
        : '#555'
      : 'rgb(91, 33, 182)';

  const marginTop = 40;
  const marginRight = 10;
  const marginBottom = 40;
  const marginLeft = 40;

  // Rows are separated by dx pixels, columns by dy pixels. These names can be counter-intuitive
  // (dx is a height, and dy a width). This because the tree must be viewed with the root at the
  // “bottom”, in the data domain. The width of a column is based on the tree’s height.
  const root = d3.hierarchy(data);
  const dx = 35;
  const dy = (width - marginRight - marginLeft) / (1 + root.height);

  // Define the tree layout and the shape for links.
  const tree = d3.tree().nodeSize([dx, dy]);
  const diagonal = d3
    .linkHorizontal()
    .x((d) => d.y)
    .y((d) => d.x);

  // Create the SVG container, a layer for the links and a layer for the nodes.
  const svg = d3
    .create('svg')
    .attr('width', width)
    .attr('height', dx)
    .attr('viewBox', [-marginLeft, -marginTop, width, dx])
    .attr(
      'style',
      'max-width: 100%; height: auto; font: 10px sans-serif; user-select: none;'
    );

  const gLink = svg
    .append('g')
    .attr('fill', 'none')
    .attr('stroke', '#555')
    .attr('stroke-opacity', 0.4)
    .attr('stroke-width', 1.5);

  const gNode = svg.append('g').attr('pointer-events', 'all');

  function update(event, source) {
    const duration = event?.altKey ? 2500 : 250; // hold the alt key to slow down the transition
    const nodes = root.descendants().reverse();
    const links = root.links();

    // Compute the new tree layout.
    tree(root);

    let left = root;
    let right = root;
    root.eachBefore((node) => {
      if (node.x < left.x) left = node;
      if (node.x > right.x) right = node;
    });

    const height = right.x - left.x + marginTop + marginBottom;

    const transition = svg
      .transition()
      .duration(duration)
      .attr('height', height)
      .attr('viewBox', [-marginLeft, left.x - marginTop, width, height])
      .tween(
        'resize',
        window.ResizeObserver ? null : () => () => svg.dispatch('toggle')
      );

    // Update the nodes…
    const node = gNode.selectAll('g').data(nodes, (d) => d.id);

    // Enter any new nodes at the parent's previous position.
    const nodeEnter = node
      .enter()
      .append('g')
      .attr('cursor', (d) => (d._children || d.children ? 'pointer' : ''))
      .attr('transform', (d) => `translate(${source.y0},${source.x0})`)
      .attr('fill-opacity', 0)
      .attr('stroke-opacity', 0)
      .on('click', (event, d) => {
        if (d.data.name) {
          d.children = d.children ? null : d._children;
          update(event, d);
        } else {
          (d.children || d._children).forEach((child) => {
            child.children = child.children ? null : child._children;
            update(event, child);
          });
        }
      });

    nodeEnter
      .append('circle')
      .attr('r', (d) => (d.children || d._children ? 12 : 16))
      .attr('fill', nodeFill)
      .attr('stroke', (d) => (d.data.pinyin ? 'rgb(236, 72, 153)' : ''))
      .attr('stroke-width', 4);

    nodeEnter
      .append('text')
      .text((d) => d.data.name)
      .attr('style', 'font-size: 16px')
      .attr('dy', '0.31em')
      .attr('x', (d) =>
        d.children || d._children ? -6 : d.data.name.length > 2 ? -12 : -6
      )
      .attr('fill', 'rgb(209, 213, 219)')
      .attr('stroke', 'rgb(209, 213, 219)');

    // Transition nodes to their new position.
    node
      .merge(nodeEnter)
      .transition(transition)
      .attr('transform', (d) => `translate(${d.y},${d.x})`)
      .attr('fill-opacity', 1)
      .attr('stroke-opacity', 1);

    // Transition exiting nodes to the parent's new position.
    node
      .exit()
      .transition(transition)
      .remove()
      .attr('transform', (d) => `translate(${source.y},${source.x})`)
      .attr('fill-opacity', 0)
      .attr('stroke-opacity', 0);

    // Update the links…
    const link = gLink.selectAll('path').data(links, (d) => d.target.id);

    // Enter any new links at the parent's previous position.
    const linkEnter = link
      .enter()
      .append('path')
      .attr('d', (d) => {
        const o = { x: source.x0, y: source.y0 };
        return diagonal({ source: o, target: o });
      });

    // Transition links to their new position.
    link.merge(linkEnter).transition(transition).attr('d', diagonal);

    // Transition exiting nodes to the parent's new position.
    link
      .exit()
      .transition(transition)
      .remove()
      .attr('d', (d) => {
        const o = { x: source.x, y: source.y };
        return diagonal({ source: o, target: o });
      });

    // Stash the old positions for transition.
    root.eachBefore((d) => {
      d.x0 = d.x;
      d.y0 = d.y;
    });
  }

  // Do the first update to the initial configuration of the tree — where a number of nodes
  // are open (arbitrarily selected as the root, plus nodes with 7 letters).
  root.x0 = dy / 2;
  root.y0 = 0;
  root.descendants().forEach((d, i) => {
    d.id = i;
    d._children = d.children;
    // Note: d.children = null 表示不展开
    // if (d.depth && d.data.name.length !== 7) d.children = null;
  });

  update(null, root);

  return svg.node();
}

function _data(FileAttachment) {
  return FileAttachment('data.json').json();
}

export function define(runtime, observer) {
  const main = runtime.module();
  function toString() {
    return this.url;
  }
  const fileAttachments = new Map([
    [
      'data.json',
      {
        url: new URL('./files/next-char-links.json', import.meta.url),
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
  main.variable(observer('chart')).define('chart', ['d3', 'data'], _chart);
  main.variable(observer('data')).define('data', ['FileAttachment'], _data);
  return main;
}
