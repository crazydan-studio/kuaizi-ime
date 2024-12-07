import { extractPinyinChars } from '#utils/utils.mjs';

/** 修正输入数据 */
export function patch(meta) {
  const deleted = [
    '虾:hā' // -> 虾:há
  ];

  const added = [
    // “一”和“不”变调有规律：https://www.chinanews.com.cn/hwjy/news/2010/04-15/2228742.shtml
    '不:bú',
    '一:yì',
    '一:yí',
    '子:zi',
    // 便宜：pián yi
    '宜:yi',
    '噷:hm',
    '吒:zhà',
    '虎:hu',
    '枸:gōu',
    '焘:tāo',
    '喇:lā',
    '喇:lá',
    '蕃:bō',
    '蕃:fān',
    '脯:pú',
    '蕻:hóng',
    '朵:duo',
    '鏜:táng',
    '咔:kā',
    '蹬:dèng',
    '爸:ba',
    '叔:shu',
    '喝:he',
    // 《定风波·自春来》 - 无那。恨薄情一去，音书无个
    // https://www.cngwzj.com/pygushi/SongDai/48900/
    '那:nuó',
    // 《桂枝香·金陵怀古》 - 谩嗟荣辱
    // https://www.cngwzj.com/pygushi/SongDai/49417/
    '谩:màn',
    // 《贺新郎·春情》 - 殢酒厌厌病
    // https://www.cngwzj.com/pygushi/SongDai/61645/
    '厌:yǎn',
    // 《贺新郎·春情》 - 断鸿难倩
    // https://www.cngwzj.com/pygushi/SongDai/61645/
    '倩:qìng',
    // 《八声甘州·记玉关踏雪事清游》 - 长河饮马
    // https://www.cngwzj.com/pygushi/SongDai/61043/
    '饮:yìn',
    // 王维《青溪》 - 趣途无百里
    // https://www.cngwzj.com/pygushi/TangDai/10982/
    '趣:qū',
    // 李白《关山月》 - 戍客望边色
    // https://www.cngwzj.com/pygushi/TangDai/12860/
    '色:yì',
    // 《听董大弹胡笳声兼寄语弄房给事》 - 四郊秋叶惊摵摵
    // https://www.cngwzj.com/pygushi/TangDai/11474/
    '摵:shè',
    // 白居易《琵琶行》 - 自言本是京城女，家在虾蟆陵下住
    // https://www.cngwzj.com/pygushi/TangDai/25273/
    '虾:há',
    // 李白《将进酒》
    // https://www.cngwzj.com/pygushi/TangDai/12843/
    '将:qiāng',
    // 《行经华阴》- 借问路傍名利客
    // https://www.cngwzj.com/pygushi/TangDai/11353/
    '傍:páng',
    // 王维《鹿柴》
    // https://www.cngwzj.com/pygushi/TangDai/11206/
    '柴:zhài',
    // 礼记《虽有嘉肴》- 学学半
    // https://www.cngwzj.com/pygushi/LiangHan/76970/
    '学:xiào',
    // 屈原《离骚》- 肇锡余以嘉名
    // https://www.cngwzj.com/pygushi/XianQin/87343/
    '锡:cì',
    //          - 来吾道夫先路
    '道:dǎo',
    // 论语《不义而富且贵，于我如浮云》- 久要不忘平生之言
    // https://www.cngwzj.com/pygushi/XianQin/88550/
    '要:yuē',
    // 论语《己所不欲，勿施于人》- 举皋陶
    // https://www.cngwzj.com/pygushi/XianQin/88549/
    '陶:yáo',
    //           - 乡也
    '乡:xiàng',
    // 论语《好仁不好学，其蔽也愚》- 陈亢问
    // https://www.cngwzj.com/pygushi/XianQin/88551/
    '亢:gāng',
    // 荀子《劝学》- 君子生非异也
    // https://www.cngwzj.com/pygushi/XianQin/86629/
    '生:xìng',
    // 司马迁《陈涉世家》- 发闾左適戍渔阳
    // https://www.cngwzj.com/pygushi/LiangHan/88083/
    '適:zhé',
    '夏:jiǎ',
    '苦:hù',
    // 列子《杞人忧天》- 舍然大喜
    // https://www.cngwzj.com/pygushi/KeWen/87901/
    '舍:shì'
  ];

  // 先增改，
  extraWords(added).forEach(({ value, pinyin, chars }) => {
    if (
      meta.value == value &&
      meta.pinyins.filter(({ value }) => value == pinyin).length == 0
    ) {
      meta.pinyins.push({ value: pinyin, chars });
    }
  });
  // 再删除，以避免自增 id 发生较大变动
  extraWords(deleted).forEach(({ value, pinyin }) => {
    if (meta.value == value) {
      meta.pinyins = meta.pinyins.filter((py) => py.value !== pinyin);
    }
  });
}

function extraWords(words) {
  return words
    .map((w) => w.split(':'))
    .map((s) => ({
      value: s[0],
      pinyin: s[1],
      chars: extractPinyinChars(s[1])
    }));
}
