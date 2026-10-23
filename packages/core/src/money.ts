/**
 * Money figures in what the user writes, before they are saved as private details (private.ts):
 * the amounts of a salary, a company's revenue, a debt, written the many ways people write them,
 * and the account numbers money moves through. A message holding one waits for the user
 * (PrivateGuard), so it is a question, not a block: a few false alarms are better than a salary
 * that reaches the AI unasked. What is not money (a year, a date, a version, 1200 users, a phone
 * number, an order number) is told apart so the question is not asked for nothing.
 */

export type MoneyShape = "amount" | "account";
export type MoneyFound = { start: number; end: number; kind: MoneyShape; value: string };

// A number as people write money: 85.000, 1,200.50, 2'500, 85.000,50, 2,4, 120.
const NUM = String.raw`\d{1,3}(?:[.,'’]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?`;
// Thousands split by spaces (1 250 000) only with a currency beside it, where it cannot be two numbers.
const NUM_SPACED = String.raw`\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?`;
const SCALE_WORD =
  "milyon|milyar|trilyon|bin|million|billion|trillion|thousand|mn|bn|Milyon|Milyar|Trilyon|Bin|MİLYON|MİLYAR|BİN|MILYON|MILYAR|Million|Billion|Thousand|MILLION|BILLION|THOUSAND";
// A Turkish case ending after a scale (4,5 milyona, 10 binlik) stays outside the value, so the
// figure is found again as "4,5 milyon".
const TR_CASE = "a|e|ı|i|u|ü|da|de|dan|den|ya|ye|yı|yi|yu|yü|luk|lük|lık|lik|un|ün|ın|in|dır|dir|tır|tir";
const WORD_END = String.raw`(?=(?:${TR_CASE})?(?!\p{L}))`;
const CASE_AFTER_SCALE = new RegExp(String.raw`^(?:${TR_CASE})(?!\p{L})`, "u");
const SCALE = String.raw`\s?(?:${SCALE_WORD})${WORD_END}|\s?[Mm](?:io|rd)\.?(?!\p{L})|(?:MM|[kKmMbB])(?!\p{L})`;
/** 2,4 milyon; 1 milyon 250 bin; 3 bin 500; 80-90 bin; 80.000–90.000. */
const core = (num: string) =>
  String.raw`(?:${num})(?:\s?[-–]\s?(?:${num}))?(?:(?:${SCALE})(?:\s(?:${NUM})\s?(?:milyon|milyar|bin|million|thousand)${WORD_END})*(?:\s\d{1,3}(?!\d|[.,]\d))?)?`;
/** In brackets as accounts write a loss, and with ",-" as prices are written in Turkey. */
const amount = (num: string) => String.raw`(?:\(${core(num)}\)|${core(num)})(?:[.,]-{1,2})?`;

const CODES = [
  "TL",
  "TRY",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "CHF",
  "CAD",
  "AUD",
  "RUB",
  "INR",
  "SAR",
  "AED",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "MXN",
  "BRL",
  "KRW",
  "BTC",
  "ETH",
  "USDT",
].join("|");
// Written small only after the figure (0.5 btc, 500 kr): before one it is a name like eth0.
const CODES_AFTER = `${CODES}|tl|Tl|usd|eur|gbp|kr|btc|eth|usdt`;
const SYMBOL_SIGN = String.raw`US\$|C\$|A\$|R\$|Rs(?:\.|(?!\p{L}))|zł|[₺$€£¥₹₽₿₩₴₦₪]`;
const SYMBOL = String.raw`${SYMBOL_SIGN}|(?:${CODES})(?!\p{L})`;
const SYMBOL_AFTER = String.raw`${SYMBOL_SIGN}|(?:${CODES_AFTER})(?!\p{L})`;
// Turkish names keep their endings outside the value (dolarlık, lirası): "85.000 dolar" is saved,
// and found again in every form. Names that begin other words (yen in yeni) need a word end.
const TR_NAMES = "[Ll]ira|[Dd]olar|[Aa]vro|[Ss]terlin|[Kk]uruş|[Rr]iyal|[Dd]irhem|[Mm]anat";
const WHOLE_NAMES =
  "[Ee]uros?|yen|[Rr]uble|[Ff]rank|[Dd]inar|[Bb]itcoin|[Dd]ollars?|bucks|[Pp]ounds?|cents?|[Rr]upees?|[Ff]rancs?";
const NAME = String.raw`(?:(?:Türk|Amerikan|ABD|US)\s)?(?:${TR_NAMES})|(?:${WHOLE_NAMES})(?!\p{L})`;

/** ₺85.000, $1.2M, USD 1,200; 85.000 TL, 2,4 milyon dolar, 1 250 000 TL, (12.500) TL. */
const WITH_CURRENCY = [
  new RegExp(String.raw`(?<!\p{L})(?:${SYMBOL})\s?${amount(NUM)}`, "gu"),
  new RegExp(String.raw`(?:${amount(NUM_SPACED)}|${amount(NUM)})\s?(?:${SYMBOL_AFTER}|${NAME})`, "gu"),
];

const TR_NUMBER =
  "bir|[iİ]ki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz|bin|milyon|milyar|trilyon|buçuk|yarım|çeyrek";
const EN_NUMBER =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|half";
const WORD = `${TR_NUMBER}|${EN_NUMBER}`;
/**
 * Beş yüz bin lira, iki milyon dolar, yarım milyon, two million dollars, half a million; Turkish
 * also written as one word (yüzbin, ikiyüzelli bin).
 */
const IN_WORDS = new RegExp(
  // Not the scale of a figure written in digits (the "milyon" of 2,4 milyon is found with it).
  String.raw`(?<!\p{L})(?<!\d\s?)((?:${WORD}|a(?=\s(?:hundred|thousand|million|billion)))(?:[\s-]*(?:${WORD})|[\s-]+(?:a|and)(?=[\s-]))*)${WORD_END}(\s?(?:${NAME}|TL|USD|EUR|[₺$€£]))?`,
  "giu",
);
// Inside what IN_WORDS found, which is number words only, so "yüzbin" holds its "bin".
const WORD_SCALE = /bin|milyon|milyar|trilyon|thousand|million|billion|trillion/iu;
// "Two hundred dollars" is money; "yüz" alone is also a face, so it counts only with a currency.
const HUNDRED = /yüz|hundred/iu;

const BARE = new RegExp(`(?:${amount(NUM)})`, "gu");
const PERCENT = new RegExp(String.raw`%\s?(?:${NUM})|(?:${NUM})\s?%`, "gu");

// Turkish stems take their endings (maaşım, kârımız); short ones that begin other words (para in
// paragraf, fon in fonksiyon, kira in kiraz) are listed with the endings they take. Each is also
// written without Turkish letters, as people type on other keyboards (maas, butce). "kar" alone is
// also snow, so only its money forms count.
const TR_STEMS = [
  "maaş",
  "ücret",
  "gelir",
  "gider",
  "ciro",
  "zarar",
  "bütçe",
  "fiyat",
  "borç",
  "kredi",
  "faiz",
  "taksit",
  "aidat",
  "hesab",
  "ikramiye",
  "harç",
  "nafaka",
  "tazminat",
  "kıdem",
  "temettü",
  "hisse",
  "yatırım",
  "sermaye",
  "yatır",
  "kazan",
  "harca",
  "havale",
  "eft",
  "iban",
  "swift",
  "brüt",
  "teklif",
  "değerleme",
  "hasılat",
  "satış",
  "maliyet",
  "harcama",
  "masraf",
  "fatura",
  "vergi",
  "kdv",
  "stopaj",
  "bakiye",
  "nakit",
  "birikim",
  "tasarruf",
  "avans",
  "ödeme",
  "tahsilat",
  "portföy",
  "kripto",
  "döviz",
  "kazanç",
  "tutar",
  "bedel",
  "marj",
  "banka",
  "bilanço",
  "teşvik",
  "hibe",
];
const TR_FORMS =
  "kâr\\p{L}*|kar(?:ı|ım|ımız|ınız|ları|lılık|lılığı|ımızı)|kira(?:m|mız|sı|yı|lık|cı|da|ya|dan|nın)?|para(?:m|mız|sı|yı|lar|dan|ya|da|nın)?|fon(?:u|um|umuz|lar|ları)?|prim(?:i|im|ler|leri)?|burs(?:u|um|lar|iyer)?|zam(?:ım|mı|lı|lar|ları)?" +
  // A card or an account the money comes from or goes to, and buying, selling, paying.
  "|kart(?:ı|ım|ımız|ın|tan|a|la|ımdan|ından|ıma|ına|ımı|ını)|al(?:dım|dık|dı|ıyorum|ıyoruz|dığım|acağım)|sat(?:tım|tık|tı|ıyorum|ıyoruz|tığım|acağım)|öde(?:dim|dik|di|yeceğim|yeceğiz|r|riz|nen|nmiş|meli)|ödüyor(?:um|uz)?" +
  // Pay by the hour, the week, the month, the year.
  "|yıllık|aylık|saatlik|haftalık|günlük|yillik|aylik|haftalik|gunluk";
const fold = (s: string) =>
  s.replace(/[şçğıöüâ]/g, (c) => ({ ş: "s", ç: "c", ğ: "g", ı: "i", ö: "o", ü: "u", â: "a" })[c] ?? c);
const EN_WORDS =
  "salary|salaries|pay|payslip|paycheck|wage|compensation|equity|rsu|bonus|revenue|arr|mrr|gmv|ebitda|income|earnings|profit|margin|burn|runway|valuation|funding|invoice|rent|mortgage|loan|debt|credit|balance|savings|net worth|tax|vat|price|pricing|cost|budget|spend|spending|payroll|dividend|interest|apr|fee|deposit|withdrawal|payment|payout|cash|money|fund|investment|investor|capital|sales|turnover|expense|billing|bill|refund|grant|stipend|allowance|alimony|pension|offer|worth|owe|owed|earn|earned|earning|paid|charged|charge|spent|bought|sold|lent|borrowed|shares|stake|ownership|cap table" +
  "|a year|per year|per annum|annually|yearly|a month|per month|monthly|an hour|per hour|hourly|a week|per week|weekly" +
  "|total|subtotal|grand total|amount|currency|gross|net(?=\\s?:)|raised?|raising|series [a-f]|seed round|toplam\\p{L}*|para birimi";
const MONEY_WORD = new RegExp(
  String.raw`(?<!\p{L})(?:(?:${[...new Set([...TR_STEMS, ...TR_STEMS.map(fold)])].join("|")})\p{L}*|${TR_FORMS}|(?:${EN_WORDS})(?:s|es)?)(?!\p{L})` +
    // 85k/yıl, $120k/yr: right after the figure, so not behind a word boundary.
    String.raw`|\/(?:yr|year|mo|month|hr|hour|wk|yıl|ay|saat|hafta)(?!\p{L})`,
  "iu",
);
/**
 * A currency named anywhere around the figure ("TL bazında 1.250.000", currency: 'EUR'). Kept apart
 * from MONEY_WORD and case-sensitive, where TRY would also be the English "try".
 */
const CURRENCY_NAMED = new RegExp(
  String.raw`(?<!\p{L})(?:${CODES}|[Ll]ira|[Dd]olar|[Aa]vro|[Ee]uros?|[Ss]terlin|[Dd]ollars?)(?!\p{L})|[₺€£¥₹₽₿₩]`,
  "u",
);
/** "85 bin net", "120k gross": the figure says what it is itself. */
const NET_AFTER = /^[ \t](?:net|brüt|brut|gross)(?!\p{L})/iu;

// What a bare number counts: not things (1200 users, 16 GB), not times, not a size on screen.
const UNIT =
  /^[ \t\u00a0]?(?:(?:adet|tane|kişi|kullanıcı|satır|sayfa|ürün|parça|saat|dakika|saniye|metre|kilometre|gün|hafta|öğrenci|çalışan|müşteri|personel|sipariş|kez|defa|karakter|kelime|istek|adım|abone|takipçi|ziyaretçi|mesaj|bayt|puan|oy|izlenme|indirme|hata)\p{L}*|(?:ay|yıl|dk|sn|km|m|cm|mm|kg|gr|g|lt|ml|gb|mb|kb|tb|px|pt|em|rem|ms|fps|hz|dpi|p|x|token|tokens|byte|bytes|bit|bits|users?|people|persons?|items?|units?|pcs|days?|weeks?|months?|years?|hours?|minutes?|seconds?|rows?|lines?|pages?|requests?|calls?|times|employees?|customers?|students?|orders?|downloads?|views?|stars?|points?|characters?|chars?|words?|followers?|subscribers?|visitors?|steps?|messages?|votes?|errors?)(?!\p{L}))/iu;
// An identifier or a place, not an amount: #48812, ID 98765, sipariş no 2024-00123, port 3000,
// v1.2, sayfa 1234, line 1532, max 255, HTTP 500.
const LABEL_BEFORE =
  /(?:#|(?<!\p{L})(?:no|nr|numara\p{L}*|id|kod\p{L}*|ref|sipariş\p{L}*|order|issue|ticket|pr|iso|port|versiyon|sürüm|version|v|tel|telefon|gsm|phone|posta\s?kodu|zip|sayfa\p{L}*|madde\p{L}*|bölüm\p{L}*|kısım|fıkra|satır\p{L}*|line|page|section|chapter|article|item|step|adım|max|min|maks|limit|length|size|boyut|width|height|count|http|status)\.?:?\s?)$/iu;

/** Lines of a table (Markdown, CSV with ";" or ",", tabs): a money word in its head counts for its rows. */
const isRow = (line: string) => /[|;\t]/.test(line) || (line.includes(",") && !/\s/.test(line.trim()));
/** Lines of a list ("- Kurulum: 45.000", "Ürün A: 125.400"): what the line above them is about counts for them. */
const isItem = (line: string) => /^\s*(?:[-*•+]|\d{1,2}[.)])\s+\S|^\s*[^:\s][^:]{0,40}:\s*\S/u.test(line);

/** The first place in a sorted list that is at least `at`. */
function firstAtLeast(list: number[], at: number): number {
  let low = 0;
  let high = list.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((list[mid] ?? 0) < at) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * One text, cut into sentences and tables once, so a pasted file with thousands of numbers is read
 * in one pass rather than once for every number in it.
 */
class Scan {
  readonly out: MoneyFound[] = [];
  private readonly cuts: number[];
  private readonly tables: { start: number; end: number }[] = [];
  private readonly verdicts = new Map<number, boolean>();

  constructor(
    readonly text: string,
    private readonly taken: { start: number; end: number }[],
  ) {
    this.cuts = [-1, ...[...text.matchAll(/[!?;\n]|\.(?!\d)/g)].map((m) => m.index ?? 0), text.length];
    let at = 0;
    let table: { start: number; end: number } | undefined;
    let head = 0;
    for (const line of text.split("\n")) {
      const end = at + line.length;
      if (!isRow(line) && !isItem(line)) table = undefined;
      else if (table) table.end = end;
      else {
        // From the line above, the heading of the table or the list, to its last line.
        table = { start: head, end };
        this.tables.push(table);
      }
      if (line.trim() && !table) head = at;
      at = end + 1;
    }
  }

  /** The table a figure is in, or else its sentence and the one before ("Maaşı konuştuk. 95 bin teklif ettiler."). */
  private around(start: number): [number, number] {
    const table = this.tables.find((t) => start >= t.start && start <= t.end);
    if (table) return [table.start, table.end];
    const end = firstAtLeast(this.cuts, start);
    return [(this.cuts[Math.max(0, end - 2)] ?? -1) + 1, this.cuts[end] ?? this.text.length];
  }

  aboutMoney(start: number): boolean {
    const [from, to] = this.around(start);
    let verdict = this.verdicts.get(from * (this.text.length + 1) + to);
    if (verdict === undefined) {
      // Names in code are words too: monthlyBudget, totalPrice.
      const words = this.text.slice(from, to).replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2");
      verdict = MONEY_WORD.test(words) || CURRENCY_NAMED.test(words);
      this.verdicts.set(from * (this.text.length + 1) + to, verdict);
    }
    return verdict;
  }

  /** Shorter than 3 cannot be hidden reliably (PrivateValues.save refuses it), so it is not offered. */
  add(start: number, value: string, kind: MoneyShape): void {
    const end = start + value.length;
    const overlaps = (o: { start: number; end: number }) => start < o.end && end > o.start;
    if (value.length < 3 || this.taken.some(overlaps) || this.out.some(overlaps)) return;
    this.out.push({ start, end, kind, value });
  }
}

/** A bare number that may be a figure: long or scaled, and not a year, a date, a time, a version, a count. */
function mayBeFigure(text: string, start: number, value: string): boolean {
  const before = text.slice(Math.max(0, start - 2), start);
  // The case ending of a scale word is not a word glued to the number (4,5 milyona aldım).
  const rest = text.slice(start + value.length, start + value.length + 24);
  const after = /\p{L}$/u.test(value) ? rest.replace(CASE_AFTER_SCALE, "") : rest;
  if (
    /[\p{L}\d%/:\-.#+_]$|\d=$|\d\s?[x×]\s?$/u.test(text.slice(Math.max(0, start - 4), start)) ||
    /^(?:\s?%|[/:\-.]\d|\p{L})/u.test(after)
  )
    return false;
  if (UNIT.test(after) || LABEL_BEFORE.test(text.slice(Math.max(0, start - 18), start))) return false;
  if (/^0\d/.test(value)) return false;
  // One of several digit groups (+90 532 123 45 67): a phone or a code, not a figure.
  if (/\d[ \t]$/.test(before) || /^[ \t]\d/.test(after)) return false;
  const scaled = /\p{L}$/u.test(value);
  if (!scaled && /^(?:19|20)\d{2}$/.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  if (scaled || digits >= 4) return true;
  // Saved, a figure is hidden wherever it stands alone, so a 3-digit one needs its money word right
  // beside it ("saatlik ücretim 750"), not just somewhere in the sentence.
  return digits === 3 && MONEY_WORD.test(text.slice(Math.max(0, start - 20), start + value.length + 12));
}

/** Account numbers and bank codes, which money moves through. */
const ACCOUNT = [
  /(?:hesap\s?(?:no|numaras\p{L}*|numaram\p{L}*|#)|account\s?(?:number|no\.?|#)|routing\s?number|sort\s?code)\s?[:.]?\s?(\d[\d\s-]{4,30}\d)/giu,
  /(?<!\p{L})(?:SWIFT|BIC)(?!\p{L})[^A-Z0-9\n]{0,12}([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)(?![A-Z0-9])/gu,
];

function findWords(scan: Scan): void {
  for (const m of scan.text.matchAll(IN_WORDS)) {
    const words = (m[1] ?? "").replace(/[\s-]+(?:a|and)$/i, "");
    const currency = m[2] ?? "";
    const start = m.index ?? 0;
    const sized = WORD_SCALE.test(words) || (currency !== "" && HUNDRED.test(words));
    if (!sized || UNIT.test(scan.text.slice(start + m[0].length, start + m[0].length + 24))) continue;
    if (currency || scan.aboutMoney(start)) scan.add(start, currency ? m[0] : words, "amount");
  }
}

/** Money figures and account numbers in a text, not overlapping what was already found in it. */
export function findMoney(text: string, taken: { start: number; end: number }[] = []): MoneyFound[] {
  const scan = new Scan(text, taken);
  for (const m of ACCOUNT.flatMap((re) => [...text.matchAll(re)])) {
    const value = m[1] ?? "";
    scan.add((m.index ?? 0) + m[0].length - value.length, value, "account");
  }
  for (const m of WITH_CURRENCY.flatMap((re) => [...text.matchAll(re)])) scan.add(m.index ?? 0, m[0], "amount");
  findWords(scan);
  for (const m of text.matchAll(BARE)) {
    const start = m.index ?? 0;
    if (!mayBeFigure(text, start, m[0])) continue;
    const after = text.slice(start + m[0].length, start + m[0].length + 8);
    if (NET_AFTER.test(after) || scan.aboutMoney(start)) scan.add(start, m[0], "amount");
  }
  for (const m of text.matchAll(PERCENT)) {
    const start = m.index ?? 0;
    if (!/[\p{L}\d]/u.test(text.slice(start - 1, start)) && scan.aboutMoney(start)) scan.add(start, m[0], "amount");
  }
  return scan.out.sort((a, b) => a.start - b.start);
}
