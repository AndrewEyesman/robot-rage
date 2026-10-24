// Lingo value semantics for translated game scripts. See values.ts for the number
// representation (integers are JS numbers, integral floats are LFloat boxes).
export * from './values';
export * from './format';
export * from './parse';
export * from './chunks';
export { collate, foldCase } from './charset';
