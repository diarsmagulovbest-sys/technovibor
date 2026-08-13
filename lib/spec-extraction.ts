import type { ProductAttributes } from "./import-types";

type AttributeInput = { name: string; description: string; category: string };

function first(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

function extractCpu(text: string) {
  let match = text.match(/\bCU([3579])[- ]?([0-9]{3}[A-Z]{0,2})\b/i);
  if (match) return `Intel Core Ultra ${match[1]} ${match[2].toUpperCase()}`;
  match = text.match(/\bU([3579])[- ]?([0-9]{3}[A-Z]{0,2})\b/i);
  if (match) return `Intel Core Ultra ${match[1]} ${match[2].toUpperCase()}`;
  match = text.match(/\bI([3579])[- ]?([0-9]{4,5}[A-Z]{0,2})\b/i);
  if (match) return `Intel Core i${match[1]}-${match[2].toUpperCase()}`;
  match = text.match(/\b(?:AMD\s+)?Ryzen\s+(AI\s+)?([3579])[- ]?([0-9]{3,5}[A-Z0-9]*)\b/i);
  if (match) return `AMD Ryzen ${match[1] ? "AI " : ""}${match[2]} ${match[3].toUpperCase()}`;
  match = text.match(/\bR([3579])[- ]([0-9]{3,4}[A-Z]{0,2})\b/i);
  if (match) return `AMD Ryzen ${match[1]} ${match[2].toUpperCase()}`;
  return undefined;
}

function extractRam(text: string) {
  const match = text.match(/(?:^|[\s/,])([4-9]|1[026]|2[048]|3[02]|4[08]|6[04]|9[06]|128)\s*G(?:B)?(?=$|[\s/,])/i);
  return match ? Number(match[1]) : undefined;
}

function extractStorage(text: string) {
  const terabytes = text.match(/(?:^|[\s/,])(\d+(?:\.\d+)?)\s*T(?:B)?(?=$|[\s/,])/i);
  if (terabytes) return Math.round(Number(terabytes[1]) * 1024);
  const gigabytes = text.match(/(?:^|[\s/,])(128|256|512|1024|2048)\s*G(?:B)?(?=\s*(?:PCIE|PCI-E|SSD|NVME|M\.2|[/,]|$))/i);
  return gigabytes ? Number(gigabytes[1]) : undefined;
}

function extractGpu(text: string) {
  const rtx = text.match(/\bRTX\s*([2345]\d{3})(?:\s*(TI|SUPER))?\b/i);
  if (rtx) return `NVIDIA GeForce RTX ${rtx[1]}${rtx[2] ? ` ${rtx[2].toUpperCase()}` : ""}`;
  const gtx = text.match(/\bGTX\s*(\d{3,4})(?:\s*(TI|SUPER))?\b/i);
  if (gtx) return `NVIDIA GeForce GTX ${gtx[1]}${gtx[2] ? ` ${gtx[2].toUpperCase()}` : ""}`;
  const radeon = text.match(/\bRadeon\s+(?:RX\s*)?([A-Z0-9 -]{3,14})\b/i);
  if (radeon) return `AMD Radeon ${radeon[1].trim()}`;
  if (/\bIris\s+Xe\b/i.test(text)) return "Intel Iris Xe";
  if (/\bIntel\s+Arc\b/i.test(text)) return "Intel Arc";
  return undefined;
}

function extractScreen(text: string) {
  const match = text.match(/(?:^|[\s/,])(1[0-9](?:\.\d)?)\s*(?:"|дюйм|(?=WQXGA|WUXGA|FHD|QHD|UHD|OLED|IPS))/i);
  return match ? Number(match[1]) : undefined;
}

export function extractProductAttributes(input: AttributeInput): ProductAttributes {
  const text = `${input.name} ${input.description}`.normalize("NFKC").replace(/\u00a0/g, " ");
  const resolutionMatch = first(text, [/\b(WQXGA|WUXGA|QHD|UHD|FHD|HD\+)\b/i]);
  const os = /\bW11H\b|Windows\s*11\s*Home/i.test(text)
    ? "Windows 11 Home"
    : /\bW11P\b|Windows\s*11\s*Pro/i.test(text)
      ? "Windows 11 Pro"
      : /\b(?:DOS|FreeDOS)\b/i.test(text)
        ? "DOS"
        : undefined;
  const storageGb = extractStorage(text);
  return {
    rulesVersion: 1,
    cpu: extractCpu(text),
    ramGb: extractRam(text),
    memoryType: /\b(?:D5|DDR5)\b/i.test(text) ? "DDR5" : /\b(?:D4|DDR4)\b/i.test(text) ? "DDR4" : undefined,
    storageGb,
    storageType: storageGb && /\b(?:PCIE|PCI-E|SSD|NVME|M\.2)\b/i.test(text) ? "SSD" : storageGb && /\bHDD\b/i.test(text) ? "HDD" : undefined,
    gpu: extractGpu(text),
    screenInches: extractScreen(text),
    resolution: resolutionMatch?.[1].toUpperCase(),
    os,
  };
}
