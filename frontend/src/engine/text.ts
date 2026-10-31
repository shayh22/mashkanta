/**
 * Text typed by a household, or written by a model, made safe to send or show: control characters
 * become spaces, runs of white space one space, and it is cut to `max` characters. Anything that is
 * not a string is nothing.
 */
export const cleanText = (value: unknown, max: number) =>
  typeof value === 'string'
    ? [...value].map((char) => (char < ' ' || char === '\u007f' ? ' ' : char)).join('').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
