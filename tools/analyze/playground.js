const graph = document.querySelector('.graph');
const board = document.querySelector('.board');
const center = { x: graph.clientWidth / 2, y: graph.clientHeight / 2 };

// 添加一个Math.radians方法，用于将度转换为弧度
Math.radians = function (degrees) {
  return (degrees * Math.PI) / 180;
};

const pinyinNextStrChars = {
  zh: 'zha,zhai,zhan,zhao,zhang,zhe,zhei,zhen,zheng,zhi,zhou,zhong,zhu,zhua,zhui,zhun,zhuo,zhuai,zhuan,zhuang',
  ch: 'cha,chai,chan,chao,chang,che,chen,cheng,chi,chou,chong,chu,chua,chui,chun,chuo,chuai,chuan,chuang',
  sh: 'sha,shai,shan,shao,shang,she,shei,shen,sheng,shi,shou,shu,shua,shui,shun,shuo,shuai,shuan,shuang',
  n: 'n,na,nai,nan,nao,nang,ne,nei,nen,neng,ng,ni,nie,nin,niu,nian,niao,ning,niang,nou,nong,nu,nun,nuo,nuan,nü,nüe',
  l: 'la,lai,lan,lao,lang,le,lei,leng,li,lia,lie,lin,liu,lian,liao,ling,liang,lo,lou,long,lu,lun,luo,luan,lü,lüe',
  d: 'da,dai,dan,dao,dang,de,dei,den,deng,di,dia,die,diu,dian,diao,ding,dou,dong,du,dui,dun,duo,duan',
  h: 'ha,hai,han,hao,hang,he,hei,hen,heng,hm,hng,hou,hong,hu,hua,hui,hun,huo,huai,huan,huang',
  m: 'm,ma,mai,man,mao,mang,me,mei,men,meng,mi,mie,min,miu,mian,miao,ming,mo,mou,mu',
  g: 'ga,gai,gan,gao,gang,ge,gei,gen,geng,gou,gong,gu,gua,gui,gun,guo,guai,guan,guang',
  k: 'ka,kai,kan,kao,kang,ke,kei,ken,keng,kou,kong,ku,kua,kui,kun,kuo,kuai,kuan,kuang',
  t: 'ta,tai,tan,tao,tang,te,teng,ti,tie,tian,tiao,ting,tou,tong,tu,tui,tun,tuo,tuan',
  p: 'pa,pai,pan,pao,pang,pei,pen,peng,pi,pie,pin,pian,piao,ping,po,pou,pu',
  z: 'za,zai,zan,zao,zang,ze,zei,zen,zeng,zi,zou,zong,zu,zui,zun,zuo,zuan',
  b: 'ba,bai,ban,bao,bang,bei,ben,beng,bi,bie,bin,bian,biao,bing,bo,bu',
  c: 'ca,cai,can,cao,cang,ce,cen,ceng,ci,cou,cong,cu,cui,cun,cuo,cuan',
  s: 'sa,sai,san,sao,sang,se,sen,seng,si,sou,song,su,sui,sun,suo,suan',
  r: 'ran,rao,rang,re,ren,reng,ri,rou,rong,ru,rua,rui,run,ruo,ruan',
  y: 'ya,yan,yao,yang,ye,yi,yin,ying,yo,you,yong,yu,yue,yun,yuan',
  j: 'ji,jia,jie,jin,jiu,jian,jiao,jing,jiang,jiong,ju,jue,jun,juan',
  q: 'qi,qia,qie,qin,qiu,qian,qiao,qing,qiang,qiong,qu,que,qun,quan',
  x: 'xi,xia,xie,xin,xiu,xian,xiao,xing,xiang,xiong,xu,xue,xun,xuan',
  f: 'fa,fan,fang,fei,fen,feng,fiao,fo,fou,fu',
  w: 'wa,wai,wan,wang,wei,wen,weng,wo,wu',
  a: 'a,ai,an,ang,ao',
  e: 'e,ei,en,eng,er',
  o: 'o,ou'
};
// {zh: {a: {'': true, i: true, n: true, o: true, ng: true}}}
const pinyinNextChars = {};
const pinyinAll = {};
const pinyinStartChars = Object.keys(pinyinNextStrChars);
pinyinStartChars.forEach((ch) => {
  const nextChars = pinyinNextStrChars[ch].split(/,/).map((c) => {
    pinyinAll[c] = true;

    return c.substr(ch.length);
  });

  const nextMap = (pinyinNextChars[ch] = {});
  nextChars.forEach((c) => {
    const first = c.substring(0, 1);
    const left = c.substr(1);

    nextMap[first] ||= {};
    nextMap[first][left] = true;
  });
});

graph.onmouseup = function () {
  nextState('end');
};

document.addEventListener('touchstart', function (e) {
  if (e.target.getAttribute('type') === 'trigger') {
    nextState('start');
  }
});

document.addEventListener('touchmove', function (e) {
  const touch = e.touches[0];
  const target = document.elementFromPoint(touch.clientX, touch.clientY);
  if (!target) {
    return;
  }

  if (target.getAttribute('type') === 'trigger') {
    nextState('next');
  } else if (target.getAttribute('type') === 'sector') {
    nextState('choose', target.getAttribute('id'));
  }
});

document.addEventListener('touchend', function (e) {
  nextState('end');
});

function drawTrigger(graph, center, radius) {
  const circle = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'circle'
  );
  circle.setAttribute('type', 'trigger');
  circle.setAttribute('class', 'trigger');
  circle.setAttribute('r', radius);
  circle.setAttribute('cx', center.x);
  circle.setAttribute('cy', center.y);

  circle.onmousedown = function () {
    nextState('start');
  };
  circle.onmouseover = function () {
    nextState('next');
  };

  graph.appendChild(circle);
}

const sectorChars = {};
const numSectors = 12;
function drawPinyinSectors(graph, center, innerRadius, outerRadius) {
  const anglePerSector = 360 / numSectors;
  const startAngle = 135;
  const charSize = Math.round(pinyinStartChars.length / numSectors);

  for (let i = 0; i < numSectors; i++) {
    const sectorId = `sector_${i}`;
    const sectorTextId = `${sectorId}_text`;
    const sectorStartAngle = startAngle + i * anglePerSector;
    const sectorEndAngle = sectorStartAngle + anglePerSector;

    sectorChars[sectorId] = pinyinStartChars.slice(
      i * charSize,
      i == numSectors - 1 ? pinyinStartChars.length : (i + 1) * charSize
    );

    const sectorInner = {
      radius: innerRadius,
      start: {
        x: center.x + innerRadius * Math.cos(Math.radians(sectorStartAngle)),
        y: center.y - innerRadius * Math.sin(Math.radians(sectorStartAngle))
      },
      end: {
        x: center.x + innerRadius * Math.cos(Math.radians(sectorEndAngle)),
        y: center.y - innerRadius * Math.sin(Math.radians(sectorEndAngle))
      }
    };
    const sectorOuter = {
      radius: outerRadius,
      start: {
        x: center.x + outerRadius * Math.cos(Math.radians(sectorStartAngle)),
        y: center.y - outerRadius * Math.sin(Math.radians(sectorStartAngle))
      },
      end: {
        x: center.x + outerRadius * Math.cos(Math.radians(sectorEndAngle)),
        y: center.y - outerRadius * Math.sin(Math.radians(sectorEndAngle))
      }
    };

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('id', sectorId);
    path.setAttribute('type', 'sector');
    path.setAttribute('class', 'sector');
    // M100,100 表示移动到中心点 (100,100)。
    // L100,20 绘制一条从中心点到圆边缘的线（半径线）。
    // A80,80 0 0,1 183.643,70.588 绘制一个椭圆弧，其中80,80是椭圆的x轴半径和y轴半径（因为是一个圆，所以两个半径相等），0 0,1表示弧的旋转角度、大弧标志和顺时针标志，183.643,70.588是弧的终点坐标。
    // L100,100 绘制另一条半径线回到中心点。
    // Z 表示闭合路径，形成一个扇形。
    path.setAttribute(
      'd',
      `M${sectorInner.start.x},${sectorInner.start.y}
      L${sectorOuter.start.x},${sectorOuter.start.y}
      A${sectorOuter.radius},${sectorOuter.radius} 0 0,0 ${sectorOuter.end.x},${sectorOuter.end.y}
      L${sectorInner.end.x},${sectorInner.end.y}
      A${sectorInner.radius},${sectorInner.radius} 0 0,1 ${sectorInner.start.x},${sectorInner.start.y}
      Z`
    );
    path.setAttribute('fill', `hsl(${i * (360 / numSectors)}, 100%, 50%)`);

    graph.appendChild(path);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const textPos = {
      x:
        ((sectorOuter.end.x + sectorOuter.start.x) / 2 +
          (sectorInner.end.x + sectorInner.start.x) / 2) /
        2,
      y:
        ((sectorOuter.end.y + sectorOuter.start.y) / 2 +
          (sectorInner.end.y + sectorInner.start.y) / 2) /
        2
    };
    text.setAttribute('id', sectorTextId);
    text.setAttribute('class', 'label');
    text.setAttribute('font-size', '24');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('x', textPos.x);
    text.setAttribute('y', textPos.y);
    text.innerHTML = sectorChars[sectorId].join(', ');

    graph.appendChild(text);

    path.onmouseover = function () {
      nextState('choose', sectorId);
    };
  }
}

function mergeDeep(...objects) {
  const isObject = (obj) => obj && typeof obj === 'object';

  return objects.reduce((prev, obj) => {
    Object.keys(obj).forEach((key) => {
      const pVal = prev[key];
      const oVal = obj[key];

      if (Array.isArray(pVal) && Array.isArray(oVal)) {
        prev[key] = pVal.concat(...oVal);
      } else if (isObject(pVal) && isObject(oVal)) {
        prev[key] = mergeDeep(pVal, oVal);
      } else {
        prev[key] = oVal;
      }
    });

    return prev;
  }, {});
}

const state = {
  started: false,
  paths: [],
  candidates: {},
  pending: null
};
function nextState(event, sectorId) {
  if (event === 'end') {
    state.started = false;
    updateSectorChars(pinyinStartChars);
  } else if (event === 'start') {
    state.started = true;
    state.paths = [];
    state.candidates = {};
    state.pending = null;
  } else if (state.started && event === 'choose') {
    const sectorTextId = `${sectorId}_text`;

    state.pending = document
      .querySelector(`#${sectorTextId}`)
      .innerHTML.split(/\s*,\s*/);
  } else if (state.started && event === 'next' && state.pending) {
    console.log('pending: ', event, state.pending);

    const firstPending = state.pending[0];
    if (state.pending.length === 1 && state.candidates[firstPending]) {
      document.querySelector('.input-result').innerHTML = firstPending;

      updateSectorChars(pinyinStartChars);

      return nextState('start');
    }

    state.paths.push(state.pending);
    state.pending = null;

    let nextChars = Object.assign({}, pinyinNextChars);
    state.paths.forEach((path) => {
      // 删除不在输入路径中的后继
      Object.keys(nextChars).forEach((n) => {
        if (!path.includes(n)) {
          delete nextChars[n];
        }
      });

      // 提升后继
      let newNextChars = {};
      Object.keys(nextChars).forEach((n) => {
        const next = nextChars[n];
        if (next !== true) {
          newNextChars = mergeDeep(newNextChars, next);
        }
      });

      nextChars = newNextChars;
    });

    const pinyins = showCandidates();

    let chars = Object.keys(nextChars).concat(pinyins);
    // 拼音组合已无后继
    if (chars.length === 0) {
      chars = pinyinStartChars;
      state.paths = [];
    }

    updateSectorChars(chars);
  }
}

function updateSectorChars(chars) {
  const selectorAmount =
    chars.length > numSectors ? Math.round(chars.length / numSectors) : 1;

  for (let i = 0; i < numSectors; i++) {
    const sectorId = `sector_${i}`;
    const sectorTextId = `${sectorId}_text`;
    const sectorChars = chars.slice(
      i * selectorAmount,
      i == numSectors - 1 ? chars.length : (i + 1) * selectorAmount
    );

    document.querySelector(`#${sectorTextId}`).innerHTML =
      sectorChars.join(', ');
  }
}

function showCandidates() {
  let results = { '': true };

  state.paths.forEach((path) => {
    const prev = Object.keys(results);
    results = {};

    path.forEach((ch) => {
      if (state.candidates[ch]) {
        return;
      }

      prev.forEach((p) => {
        results[p + ch] = true;
      });
    });
  });

  Object.keys(results).forEach((p) => {
    if (pinyinAll[p]) {
      state.candidates[p] = true;
    }
  });
  console.log('candidates: ', state.candidates);

  const pinyins = Object.keys(state.candidates);
  document.querySelector('.input-result').innerHTML = pinyins.join(', ');

  return pinyins;
}

drawTrigger(graph, center, 150);
drawPinyinSectors(board, center, 150, Math.min(center.x, center.y));
