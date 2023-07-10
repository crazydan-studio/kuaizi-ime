// https://www.cnblogs.com/zczhangcui/p/10300090.html

const $keyboard = document.body.querySelector('.keyboard');
const $pinyinStrokeLayer = document.body.querySelector('.pinyin-stroke-layer');
const $simulateResult = document.body.querySelector('.data .result');

const timer = {
  id: 0,
  duration: 500
};
const line = 8;
const lineCount = 9;
const hexWidth = 100;
const hexSpacing = 5;
const hexOuterWidth = hexWidth + 2 * hexSpacing;
const keyMapping = {
  10: '？',
  19: 'h',
  20: 'g',
  21: 'x',
  22: 'c',
  23: '空格',
  11: 'j',
  12: 'q',
  13: 's',
  14: 'z',
  15: '删除',
  17: '翻转',
  0: '键盘',
  2: 'i',
  3: 'a',
  4: 'e',
  5: 'o',
  6: 'u',
  27: 'n',
  28: 'l',
  29: '<&lt;o&gt;>',
  30: 'w',
  31: 'k',
  32: '换行',
  36: 'r',
  37: 'f',
  38: 'm',
  39: 'p',
  40: '英文',
  1: '：',
  9: '！',
  18: 'ü',
  26: '、',
  35: '，',
  44: '。',
  45: 'd',
  46: 'b',
  47: 't',
  48: 'y',
  49: '标点'
};

initKeyboard();

function initKeyboard() {
  for (let i = 0; i < line * lineCount - 4; i++) {
    const keyChar = keyMapping[i] || '';

    const $key = document.createElement('li');
    $key.className = 'key ' + (keyChar ? '' : 'disabled');
    $key.id = getKeyElementId(keyChar || i);
    $key.setAttribute('name', keyChar || '');
    $key.innerHTML = `
          <span class="hex"><span class="hex-inner">
          <span class="index">${i}</span><br/>
          <span class="char">${keyChar}</span>
          <!--<input type="text" style="width: 24px;margin-left: 8px;">-->
          </span></span>
          `;

    $keyboard.appendChild($key);
  }

  $keyboard.style.width = `${lineCount * hexOuterWidth}px`;

  // 假设需要平行边距离为w的六边形，每个六边形之间的间隔为m。
  // 如果第一排有x个六边形，那么为实现相邻两排交错排列的效果，
  // 需要设置: .key:nth(`2x - 1`n + `x + 1`) { margin-left: 0.5(w+2m) }。
  // 比如第一排有6个，那么li:nth(11n+7) { ... }
  const $lineCount = document.createElement('style');
  $lineCount.textContent = `
      .key:nth-child(${2 * lineCount - 1}n+${lineCount + 1}) { margin-left: ${
    0.5 * hexOuterWidth
  }px; }
      `;
  document.head.appendChild($lineCount);

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
