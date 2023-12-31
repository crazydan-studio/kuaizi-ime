// https://www.cnblogs.com/zczhangcui/p/10300090.html

const $keyboard = document.body.querySelector('.keyboard');
const $pinyinStrokeLayer = document.body.querySelector('.pinyin-stroke-layer');
const $simulateResult = document.body.querySelector('.data .result');

const timer = {
  id: 0,
  duration: 500
};
const cos_30 = Math.cos(Math.PI / 6);
const sin_30 = Math.sin(Math.PI / 6);
const hexRows = 6;
const hexColumns = 8;
const hexRadius = 50;
const hexWidth = 2 * (hexRadius * cos_30);
const hexHeight = 2 * hexRadius;
// 正六边形间距通过嵌套外六边形实现
const hexSpacing = 5;
const hexOuterRadius = hexRadius + hexSpacing / (2 * cos_30);
const hexOuterWidth = 2 * (hexOuterRadius * cos_30);
const hexOuterHeight = 2 * hexOuterRadius;
const hexOuterMarginTop = -hexOuterRadius * sin_30;
const hexRowsWidth = (hexColumns + 0.5) * hexOuterWidth;
const keys = [
  // row 0
  ['翻转', '😂', '！', 'ü', 'i', 'u', 'o', 'j'],
  // row 1
  ['算术', '？', 'd', 'm', 'x', 'q', 'a', '删除'],
  // row 2
  ['拉丁', '😄', '；', 'b', 'l', 'y', 'p', 'e'],
  // row 3
  ['表情', '：', 's', 't', '&lt;定位>', 'r', 'h', '换行'],
  // row 4
  ['标点', '😉', '。', 'c', 'z', 'f', 'n', 'k'],
  // row 5
  ['撤回', '，', 'sh', 'ch', 'zh', 'g', 'w', '空格']
];

initKeyboard();

function initKeyboard() {
  for (let i = 0; i < hexRows; i++) {
    for (let j = 0; j < hexColumns; j++) {
      const keyChar = (keys[i] || [])[j] || '';

      const $key = document.createElement('li');
      $key.className = 'key ' + (keyChar ? '' : 'hidden');
      $key.id = getKeyElementId(keyChar || i + '-' + j);
      $key.setAttribute('name', keyChar || '');
      $key.innerHTML = `
          <span class="hex"><span class="hex-inner">
          <span class="index">${i},${j}</span><br/>
          <span class="char">${keyChar}</span>
          <!--<input type="text" style="width: 24px;margin-left: 8px;">-->
          </span></span>
          `;

      $keyboard.appendChild($key);
    }
  }

  $keyboard.style.width = `${hexRowsWidth}px`;

  const $hexComputedStyle = document.createElement('style');
  $hexComputedStyle.textContent = `
      .demo { padding-top: ${-hexOuterMarginTop}px; }
      .hex {
        width: ${hexOuterWidth}px;
        height: ${hexOuterHeight}px;
        margin-top: ${hexOuterMarginTop}px;
      }
      .hex-inner { width: ${hexWidth}px; height: ${hexHeight}px; }
      .key:nth-child(${hexColumns * 2}n+${hexColumns + 1}) {
        margin-left: ${0.5 * hexOuterWidth}px;
      }
      `;
  document.head.appendChild($hexComputedStyle);

  const $btnClear = document.body.querySelector('.data .btn [name="clear"]');
  const $btnStop = document.body.querySelector('.data .btn [name="stop"]');
  const $btnSimulate = document.body.querySelector(
    '.data .btn [name="simulate"]'
  );
  const $inputPinyin = document.body.querySelector('.data [name="pinyin"]');
  const $inputDuration = document.body.querySelector('.data [name="duration"]');

  $inputDuration.value = timer.duration + '';
  $inputDuration.onchange = function () {
    timer.duration = parseInt(this.value);
  };
  $btnStop.onclick = function () {
    if (timer.id > 0) {
      clearTimeout(timer.id);
      timer.id = 0;
    }
    $btnClear.disabled = false;
    $btnSimulate.disabled = false;
  };
  $btnClear.onclick = function () {
    $inputPinyin.value = '';
    $simulateResult.innerHTML = '';

    oneByOne(hiddenStrokeLayer(), unhighlightAllKeyElements())();
  };
  $btnSimulate.onclick = function () {
    const text = $inputPinyin.value.trim();
    if (!text) {
      return;
    }

    $btnStop.onclick();
    $btnSimulate.disabled = true;
    $btnClear.disabled = true;
    $simulateResult.innerHTML = '';

    strokePinyin(text.split(/\s+/), () => {
      $btnClear.disabled = false;
      $btnSimulate.disabled = false;
      $btnSimulate.disabled = false;
    });
  };
}

function getKeyElementId(char) {
  return `key-${char}`;
}

function getKeyElement(k) {
  const id = getKeyElementId(k);
  return document.getElementById(id);
}

function unhighlightAllKeyElements() {
  return unhighlightElement(...$keyboard.querySelectorAll('.key'));
}

function unhighlightAllDescendantKeyElements() {
  return () => {
    $keyboard
      .querySelectorAll('.key')
      .forEach(($el) => $el.classList.remove('descendant', 'hidden'));
  };
}

function highlightDescendantKeyElements(keys) {
  return () => {
    keys
      .map(getKeyElement)
      .forEach(($el) => $el && $el.classList.add('descendant'));
    $keyboard
      .querySelectorAll('.key:not(.highlight,.descendant)')
      .forEach(($el) => $el.classList.add('hidden'));
  };
}

function highlightElement(...$els) {
  return () => {
    $els.forEach(($el) => $el && $el.classList.add('highlight'));
  };
}

function unhighlightElement(...$els) {
  return () => {
    $els.forEach(
      ($el) => $el && $el.classList.remove('highlight', 'descendant', 'hidden')
    );
  };
}

function getPinyinKeys(pinyin) {
  if (!pinyin) {
    return [];
  }

  const keys = [];
  for (let i = 0; i < pinyin.length; i++) {
    keys.push(pinyin.charAt(i));
  }
  return keys;
}

function clearStrokePath() {
  const $strokePath = document.getElementById('stroke-path');
  $strokePath.setAttribute('d', '');
}

function drawStrokePath(x, y) {
  return () => {
    const $strokePath = document.getElementById('stroke-path');
    const d = $strokePath.getAttribute('d');

    $strokePath.setAttribute('d', d ? `${d} L${x} ${y}` : `M${x} ${y}`);
  };
}

function showStrokeLayer(pinyin) {
  return () => {
    clearStrokePath();
    $pinyinStrokeLayer.querySelector(
      '.text'
    ).innerHTML = `<span>划词: ${pinyin}</span>`;

    $pinyinStrokeLayer.classList.remove('hidden');
  };
}

function hiddenStrokeLayer() {
  return () => {
    $pinyinStrokeLayer.classList.add('hidden');

    clearStrokePath();
    $pinyinStrokeLayer.querySelector('.text').innerHTML = '';
  };
}

function strokePinyin(pinyinList, gotoNext) {
  const pinyinKeyTree = createPinyinKeyTree(pinyinList);

  let steps = [];
  for (let i = 0; i < pinyinList.length; i++) {
    const pinyin = pinyinList[i];

    steps = steps.concat(creatStorkePinyinSteps(pinyin, pinyinKeyTree));
  }

  if (gotoNext) {
    steps.push(gotoNext);
  }

  stepRun(...steps);
}

function creatStorkePinyinSteps(pinyin, pinyinKeyTree) {
  const keys = getPinyinKeys(pinyin.trim());
  if (keys.length === 0) {
    return;
  }

  const keyboardRect = $keyboard.getBoundingClientRect();

  let keyTree = pinyinKeyTree;
  const highlights = [];
  const keyIndexes = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const $key = getKeyElement(key);
    const keyIndex = $key.querySelector('.index').innerText;
    const keyRect = $key.querySelector('.hex').getBoundingClientRect();
    const cx = keyRect.x + keyRect.width / 2;
    const cy = keyRect.y + keyRect.height / 2;
    const x = cx - keyboardRect.x;
    const y = cy - keyboardRect.y;

    keyTree = keyTree[key];
    const descendantKeys = Object.keys(keyTree);

    highlights.push(
      oneByOne(
        highlightElement($key),
        unhighlightAllDescendantKeyElements(),
        highlightDescendantKeyElements(descendantKeys),
        drawStrokePath(x, y)
      )
    );
    keyIndexes.push(keyIndex);
  }

  const createResult = () => {
    const $result = document.createElement('div');
    $result.className = 'item';
    $result.innerHTML = `${pinyin}: ${keyIndexes.join(' -> ')}`;
    $result.onclick = function () {
      if (timer.id > 0) {
        return;
      }

      oneByOne(unhighlightAllKeyElements(), showStrokeLayer(pinyin))();
      stepRun(...highlights);
    };

    $simulateResult.prepend($result);
  };

  return [
    oneByOne(unhighlightAllKeyElements(), showStrokeLayer(pinyin)),
    createResult,
    ...highlights
  ];
}

function stepRun(...steps) {
  if (!steps || steps.length === 0) {
    timer.id = 0;
    return;
  }

  timer.id = setTimeout(() => {
    const [first, ...left] = steps;

    first();
    stepRun(...left);
  }, timer.duration);
}

function oneByOne(...fns) {
  return () => {
    fns.forEach((fn) => fn());
  };
}

function createPinyinKeyTree(pinyinList) {
  const tree = {};

  for (let i = 0; i < pinyinList.length; i++) {
    const pinyin = pinyinList[i];
    const keys = getPinyinKeys(pinyin);

    let subTree = tree;
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];

      subTree = subTree[key] || (subTree[key] = {});
    }
  }

  return tree;
}
