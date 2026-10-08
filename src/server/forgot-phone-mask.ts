/** Shows the stored mobile for an email without revealing the full number.
 *  + country code, first 2 national digits, x's, last 2 digits.
 *  Example: +96550123456 -> +965 50xxxxxx56
 */
const DIALS = ["1684","1264","1268","1242","1246","1441","1345","1767","1809","1829","1849","1473","1876","1869","1758","1784","1868","1340","1670","1671","966","965","971","974","973","968","967","964","963","962","961","960","358","354","353","351","350","299","298","297","291","269","268","267","266","265","264","263","262","261","260","258","257","256","255","254","253","252","251","250","249","248","247","246","245","244","243","242","241","240","239","238","237","236","235","234","233","232","231","230","229","228","227","226","225","224","223","222","221","220","218","216","213","212","211","98","95","94","93","92","91","90","86","84","82","81","66","65","64","63","62","61","60","58","57","56","55","54","53","52","51","49","48","47","46","45","44","43","41","40","39","36","34","33","32","31","30","27","20","7","1"];

export function maskStoredPhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 6) return "";
  const dial = DIALS.find(code => digits.startsWith(code)) || "";
  const national = dial ? digits.slice(dial.length) : digits;
  if (national.length < 4) return `+${dial} ${national}`;
  const head = national.slice(0, 2);
  const tail = national.slice(-2);
  const hidden = "x".repeat(Math.max(2, national.length - 4));
  return `+${dial} ${head}${hidden}${tail}`.replace("+ ", "+");
}
