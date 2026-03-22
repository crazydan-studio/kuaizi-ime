export function naiveHTMLNodeInnerText(node) {
  // https://github.com/jsdom/jsdom/issues/1245#issuecomment-1243809196
  // We need Node(DOM's Node) for the constants,
  // but Node doesn't exist in the nodejs global space,
  // and any Node instance references the constants
  // through the prototype chain
  const Node = node;

  return node && node.childNodes
    ? [...node.childNodes]
        .map((node) => {
          switch (node.nodeType) {
            case Node.TEXT_NODE:
              return node.textContent;
            case Node.ELEMENT_NODE:
              return naiveHTMLNodeInnerText(node);
            default:
              return '';
          }
        })
        .join(' ')
    : '';
}
