export function formatBilingualDateTime(date=new Date()) {
  const timeOptions={hour:'2-digit',minute:'2-digit',hourCycle:'h23'};
  const dateOptions={weekday:'long',day:'numeric',month:'long',year:'numeric'};
  const englishTime=new Intl.DateTimeFormat('en-GB',timeOptions).format(date);
  const arabicTime=new Intl.DateTimeFormat('ar-EG',timeOptions).format(date);
  const englishDate=new Intl.DateTimeFormat('en-GB',dateOptions).format(date).replace(/,/g,'');
  const arabicDate=new Intl.DateTimeFormat('ar-EG',dateOptions).format(date).replace(/[،,]/g,'');
  return {
    en:`${englishTime} · ${englishDate}`,
    ar:`${arabicTime} · ${arabicDate}`
  };
}
