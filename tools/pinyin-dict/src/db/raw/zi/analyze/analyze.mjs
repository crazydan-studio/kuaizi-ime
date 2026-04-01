import { appendLineToFile } from '#utils/file.mjs';
import { splitChars } from '#utils/spell.mjs';
import { queryAll } from '#utils/sqlite.mjs';

/** 生成拼音字母组合数据 */
export function genPinyinChars(db, file) {
  const values = [];
  const nextCharsMap = {};

  queryAll(db, 'select distinct value_ from meta_pinyin order by value_').forEach(
    (row) => {
      const value = row.value_;
      values.push(value);

      const nextChars =
        value.charAt(1) === 'h' ? value.substring(2) : value.substring(1);
      nextChars && (nextCharsMap[nextChars] = true);
    }
  );

  console.log(
    '- 后继字母列表: ',
    JSON.stringify(Object.keys(nextCharsMap).sort())
  );

  appendLineToFile(file, values.join('\n'), true);
}

/** 生成拼音字母的连接数据 */
export function genPinyinCharLinks(db, file) {
  const links = {};
  queryAll(db, 'select distinct value_ from meta_pinyin order by value_').forEach(
    (row) => {
      const value = row.value_;
      const chars = splitChars(value);

      if (chars.length > 1) {
        for (let i = 1; i < chars.length; i++) {
          const source = chars[i - 1];
          const target = chars[i];

          (links[source] ||= {})[target] = true;
        }
      }
    }
  );

  const results = [];
  Object.keys(links).forEach((source) => {
    Object.keys(links[source]).forEach((target) => {
      results.push({ source, target });
    });
  });

  appendLineToFile(file, JSON.stringify(results), true);
}

/** 生成拼音字母后继树数据 */
export function genPinyinCharTree(db, file) {
  const tree = {};
  queryAll(db, 'select distinct value_ from meta_pinyin order by value_').forEach(
    (row) => {
      const value = row.value_;
      const chars = splitChars(value);

      if (chars.length > 1) {
        let parent = tree;
        let child;

        for (let i = 1; i < chars.length; i++) {
          const source = chars[i - 1];
          const target = chars[i];

          parent = parent[source] ||= {};
          child = parent[target] ||= {};
        }

        child.__is_pinyin__ = true;
      } else {
        const source = chars[0];
        tree[source] = { __is_pinyin__: true };
      }
    }
  );

  const getKeys = (obj) =>
    Object.keys(obj).filter((k) => !k.startsWith('__') && !k.endsWith('__'));
  const traverse = (links, top, level, prefix) => {
    const parent = links[top];

    prefix ||= '';

    const subs = getKeys(parent).sort();
    if (subs.length === 0) {
      return { name: prefix + top, pinyin: true, level };
    }

    if (level > 1) {
      const result = subs
        .reduce((r, sub) => {
          const child = traverse(parent, sub, level + 1);
          if (Array.isArray(child)) {
            r.push(...child.map((c) => top + c.name));
          } else if (typeof child === 'string') {
            r.push(top + child);
          } else {
            r.push(top + child.name);
          }

          return r;
        }, [])
        .concat(parent.__is_pinyin__ ? [top] : [])
        .sort()
        .map((sub) => ({ name: prefix + sub, pinyin: true, level }));

      return result;
    }

    const children = [];
    subs.forEach((sub) => {
      let child;

      if (['c', 's', 'z'].includes(top) && sub === 'h') {
        child = traverse(parent, sub, 0);
      } else {
        child = traverse(parent, sub, level + 1, level > 0 ? top : '');
      }

      if (Array.isArray(child)) {
        children.push(...child);
      } else {
        children.push(child);
      }
    });

    if (parent.__is_pinyin__) {
      return { name: top, pinyin: true, level, children };
    }
    return { name: top, level, children };
  };

  const results = [];
  getKeys(tree).forEach((source) => {
    const child = traverse(tree, source, 0);
    results.push(child);
  });

  appendLineToFile(file, JSON.stringify({ name: '', children: results }), true);
}
