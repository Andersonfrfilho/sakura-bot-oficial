// Porte mecânico das funções puras de formatação/parsing de src/setup.ts.

import type { CartItem, CartSummaryResult, ValidateNameResult } from './botEngine.types.ts';

const BAD_WORDS: ReadonlyArray<string> = [
  'merda', 'porra', 'caralho', 'buceta', 'viado', 'puta', 'fdp', 'cuzão', 'cuza', 'cuzao',
  'fuder', 'foder', 'foda', 'arrombado', 'babaca', 'idiota', 'imbecil', 'cretino', 'otario',
  'otário', 'lixo', 'vagabundo', 'vagabunda', 'piranha', 'safado', 'safada', 'desgraça',
  'desgraca', 'bosta', 'pau', 'cacete', 'xoxota', 'pentelho', 'prostituta',
];

const WEEKDAY_MAP: Record<string, number> = {
  segunda: 1, terça: 2, terca: 2, quarta: 3, quinta: 4, sexta: 5,
  sábado: 6, sabado: 6, domingo: 0,
};

export function fmtBRL(value: number): string {
  return Number(value).toFixed(2).replace('.', ',');
}

export function fmtDuration(minutes: number): string {
  if (minutes < 60) return minutes + ' min';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours + 'h' + (mins > 0 ? ' ' + mins + 'min' : '');
}

export function fmtDate(iso: string): string {
  return iso ? iso.split('-').reverse().join('/') : '';
}

export function validateName(raw: string): ValidateNameResult {
  const name = raw.trim();
  if (name.length < 2) return { valid: false, reason: 'short' };
  if (/\d/.test(name)) return { valid: false, reason: 'numbers' };
  if (!/^[\p{L}\s'\-]+$/u.test(name)) return { valid: false, reason: 'invalid_chars' };
  if (/^(.)\1{3,}$/u.test(name.replace(/\s/g, ''))) return { valid: false, reason: 'repeated' };
  const lower = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const word of BAD_WORDS) {
    const wordNorm = word.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (lower === wordNorm || lower.split(/\s+/).includes(wordNorm)) {
      return { valid: false, reason: 'bad_word' };
    }
  }
  return { valid: true };
}

export function capitalizeName(name: string): string {
  return name.trim().replace(/\b\p{L}/gu, (char: string) => char.toUpperCase());
}

export function parseTrocoInput(texto: string, amountToPay: number): number | null {
  const normalized = texto.trim().toLowerCase().replace(',', '.');
  const trocoMatch = normalized.match(/^([\d.]+)\s*(?:de\s*)?troco$/)
    || normalized.match(/^troco\s*(?:de\s*)?([\d.]+)$/);
  if (trocoMatch) {
    const troco = parseFloat(trocoMatch[1] ?? '');
    return isNaN(troco) ? null : amountToPay + troco;
  }
  const value = parseFloat(normalized);
  return isNaN(value) ? null : value;
}

export function cartSummary(items: CartItem[]): CartSummaryResult {
  let total = 0;
  const lines: string[] = [];
  for (const item of items) {
    const sub = item.price * item.qty;
    total += sub;
    lines.push('• *' + item.name + '* × ' + item.qty + ' — R$ ' + fmtBRL(sub));
  }
  return { lines, total };
}

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const deltaLat = (lat2 - lat1) * Math.PI / 180;
  const deltaLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function generateOrderCode(phone: string): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return 'PED-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate())
    + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + '-' + phone.slice(-4);
}

export function parseDate(text: string): string | null {
  const now = new Date();
  const normalized = text.toLowerCase();
  if (normalized.includes('hoje')) return now.toISOString().split('T')[0] ?? null;
  if (normalized.includes('amanhã') || normalized.includes('amanha')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0] ?? null;
  }
  const dayMonthMatch = normalized.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1] ?? '');
    const month = parseInt(dayMonthMatch[2] ?? '') - 1;
    const yearGroup = dayMonthMatch[3];
    const year = yearGroup ? parseInt(yearGroup) : now.getFullYear();
    const date = new Date(year, month, day);
    if (date <= now && !yearGroup) date.setFullYear(date.getFullYear() + 1);
    return date.toISOString().split('T')[0] ?? null;
  }
  for (const [dayName, dayNumber] of Object.entries(WEEKDAY_MAP)) {
    if (normalized.includes(dayName)) {
      const date = new Date(now);
      let diff = (dayNumber - date.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      date.setDate(date.getDate() + diff);
      return date.toISOString().split('T')[0] ?? null;
    }
  }
  return null;
}

export function parseTime(text: string): string | null {
  const match = text.match(/(\d{1,2})\s*[hH]\s*(\d{2})?|(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hourWithH = match[1];
  if (hourWithH !== undefined) return hourWithH.padStart(2, '0') + ':' + (match[2] || '00');
  return (match[3] ?? '').padStart(2, '0') + ':' + (match[4] ?? '');
}

export function parsePeople(text: string): number | null {
  const explicitMatch = text.match(/para\s+(\d{1,2})\s*(?:pessoas?|pax)?/i);
  if (explicitMatch) {
    const count = parseInt(explicitMatch[1] ?? '');
    if (count >= 1 && count <= 30) return count;
  }
  const bareMatch = text.match(/(\d{1,2})\s*(?:pessoas?|pax|adultos?)/i);
  if (bareMatch) {
    const count = parseInt(bareMatch[1] ?? '');
    if (count >= 1 && count <= 30) return count;
  }
  return null;
}
