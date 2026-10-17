// node:net isIP, used to classify brand-capture hosts.
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isIP(value) {
  const text = String(value);
  if (IPV4.test(text)) return 4;
  if (text.includes(':')) {
    try {
      new URL(`http://[${text}]/`);
      return 6;
    } catch {
      return 0;
    }
  }
  return 0;
}

export default { isIP };
