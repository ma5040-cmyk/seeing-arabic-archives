const PLACE_ARABIC={
  'Giza':'الجيزة','Egypt':'مصر','Beirut':'بيروت','Damascus':'دمشق','Fez':'فاس',
  'Lebanon':'لبنان','Syria':'سوريا','Morocco':'المغرب','Jerusalem':'القدس',
  'Palestine':'فلسطين','Cairo':'القاهرة','Aleppo':'حلب','New York':'نيويورك',
  'Lower Manhattan':'مانهاتن السفلى','USA':'الولايات المتحدة','Baghdad':'بغداد',
  'Abu Dhabi':'أبوظبي','UAE':'الإمارات','Mecca':'مكة','Doha':'الدوحة',
  'Birzeit':'بيرزيت','London':'لندن','Paris':'باريس','Collegeville':'كوليجفيل',
  'College Park':'كوليدج بارك','Tripoli':'طرابلس','Gulf':'الخليج',
  'Lebanese diaspora':'الشتات اللبناني','Arab world':'العالم العربي','New York City':'مدينة نيويورك',
  'Berlin':'برلين','Cambridge':'كامبريدج','MA':'ماساتشوستس','MD':'ماريلاند',
  'MN':'مينيسوتا','NC':'كارولاينا الشمالية','College Park, MD':'كوليدج بارك، ماريلاند',
  'Collegeville, MN':'كوليجفيل، مينيسوتا','Dearborn':'ديربورن','Djerba':'جربة',
  'Boulogne-Billancourt':'بولون-بيانكور','Dubai':'دبي','Houston':'هيوستن',
  'Istanbul':'إسطنبول','Leiden':'لايدن','London (Kew)':'لندن (كيو)',
  'Los Angeles':'لوس أنجلوس','New Cairo':'القاهرة الجديدة','Oxford':'أكسفورد',
  'Raleigh':'رالي','São Paulo':'ساو باولو','Sharjah':'الشارقة',
  'Washington':'واشنطن','Qornet el-Hamra':'قرنة الحمرا','Metn':'المتن',
  'Haret Hreik':'حارة حريك','Kew':'كيو','Washington, DC':'واشنطن العاصمة',
  'New York (Lower Manhattan)':'نيويورك (مانهاتن السفلى)',
  'Damascus or Fez':'دمشق أو فاس','United Kingdom':'المملكة المتحدة','France':'فرنسا',
  'Germany':'ألمانيا','Netherlands':'هولندا','Brazil':'البرازيل','Turkey':'تركيا'
};
const TYPE_ARABIC={
  photo:'صور فوتوغرافية',photograph:'صور فوتوغرافية',photographs:'صور فوتوغرافية',
  image:'صور',images:'صور',film:'أفلام',video:'فيديو',audio:'تسجيلات صوتية',
  document:'وثائق',documents:'وثائق',poster:'ملصقات',postcard:'بطاقات بريدية',
  manuscript:'مخطوطات',architecture:'عمارة',archive:'أرشيف'
};
const ITEM_ARABIC={
  'kahn-autochrome':'صور أوتوكروم من أرشيف الكوكب',
  'matson-jerusalem':'صورة من المستعمرة الأميركية / ماتسون',
  'aif-studio':'صورة استوديو، المؤسسة العربية للصورة',
  'pmda-family':'مجموعة عائلية، أرشيف المتحف الفلسطيني الرقمي',
  'amar-78rpm':'تسجيل من عصر النهضة على أسطوانة ٧٨ دورة',
  'creative-memory':'ملصق / جدارية، الذاكرة الإبداعية للثورة السورية',
  'little-syria-1929':'شارع واشنطن، سوريا الصغيرة',
  'malhame-home-movies':'أفلام هيلين جاكوبس ملحميه المنزلية',
  'shap-syria-site':'صورة من أرشيف الصور التاريخية السورية',
  'qdl-gulf-file':'ملف رقمي عن الخليج',
  'absence-damascus':'لا توجد إشارة'
};

export function arabicDigits(value) {
  return String(value).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}

export function translatePlace(value='') {
  return String(value).split(/(\s*\/\s*|\s*,\s*|\s*·\s*|\s*;\s*|\s*\(\s*|\s*\)\s*)/)
    .map(part=>{
      const clean=part.trim();
      if(!clean)return part;
      if(PLACE_ARABIC[clean])return PLACE_ARABIC[clean];
      return clean.replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[Number(d)]);
    }).join('');
}

export function translateMedia(value='') {
  return String(value).split(/[;,/]+/).map(type=>{
    const clean=type.trim().toLowerCase();
    return TYPE_ARABIC[clean]||TYPE_ARABIC[clean.replace(/s$/,'')]||'مواد أرشيفية';
  }).join('، ');
}

export function titleArabic(item={},archive={}) {
  return item.title_ar||ITEM_ARABIC[item.id]||archive.name_ar||'سجل أرشيفي';
}

export function arabicArchiveDate(value='') {
  return arabicDigits(String(value).replace(/present/ig,'حتى الآن').replace(/March/ig,'مارس').replace(/April/ig,'أبريل'));
}
