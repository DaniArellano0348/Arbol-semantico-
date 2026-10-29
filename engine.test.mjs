import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, parseKnowledgeBase } from './engine.mjs';

const acceptanceInput = [
  'R1: Si es de día, entonces voy a trabajar.',
  'R2: Si llueve, entonces no voy a trabajar.',
  'R3: Es de día.',
].join('\n');

test('caso obligatorio: tres ramas terminales y modelo esperado', () => {
  const { knowledgeBase, tableau } = analyze(acceptanceInput);
  assert.deepEqual(knowledgeBase.rules.map((rule) => rule.formula), ['p → q', 'r → ¬q', 'p']);
  assert.deepEqual(knowledgeBase.atoms.map(({ letter, meaning }) => [letter, meaning]), [
    ['p', 'Es de día'], ['q', 'Voy a trabajar'], ['r', 'Llueve'],
  ]);
  assert.equal(tableau.satisfiable, true);
  assert.deepEqual(tableau.branches, { open: 1, closed: 2 });
  assert.deepEqual(tableau.models[0].assignment, {
    'es de día': true, 'voy a trabajar': true, llueve: false,
  });
});

test('hecho simple es satisfacible', () => {
  assert.equal(analyze('Es de día').tableau.satisfiable, true);
});

test('contradicción directa es insatisfacible', () => {
  assert.equal(analyze('Es de día\nNo es de día').tableau.satisfiable, false);
});

test('conjunción y disyunción se traducen correctamente', () => {
  assert.equal(parseKnowledgeBase('Es de día y llueve').rules[0].formula, 'p ∧ q');
  assert.equal(parseKnowledgeBase('Llueve o hace frío').rules[0].formula, 'p ∨ q');
});

test('implicación y equivalencia se traducen correctamente', () => {
  assert.equal(parseKnowledgeBase('Si llueve, entonces hace frío').rules[0].formula, 'p → q');
  assert.equal(parseKnowledgeBase('Llueve si y solo si hace frío').rules[0].formula, 'p ↔ q');
});

test('la notación conserva los paréntesis que cambian el alcance', () => {
  assert.equal(parseKnowledgeBase('No (Llueve o hace frío)').rules[0].formula, '¬(p ∨ q)');
  assert.equal(parseKnowledgeBase('(Llueve si y solo si hace frío) si y solo si nieva').rules[0].formula, '(p ↔ q) ↔ r');
});

test('la negación reutiliza el átomo', () => {
  const knowledgeBase = parseKnowledgeBase('Voy a trabajar\nNo voy a trabajar');
  assert.equal(knowledgeBase.atoms.length, 1);
  assert.deepEqual(knowledgeBase.rules.map((rule) => rule.formula), ['p', '¬p']);
});

test('la negación de implicación agrega antecedente y consecuente negado', () => {
  const { tableau } = analyze('No (Si llueve, entonces hace frío)');
  const event = tableau.root.children[0];
  assert.equal(event.rule, 'Negación de implicación');
  assert.deepEqual(event.children[0].added.map((entry) => entry.formula), ['p', '¬q']);
});

test('la negación de conjunción ramifica en dos alternativas', () => {
  const { tableau } = analyze('No (Es de día y llueve)');
  const event = tableau.root.children[0];
  assert.equal(event.rule, 'Negación de conjunción');
  assert.equal(event.children.length, 2);
  assert.deepEqual(event.children.map((child) => child.added[0].formula), ['¬p', '¬q']);
});

test('la negación de disyunción y la doble negación se expanden en la misma rama', () => {
  const { tableau: notOr } = analyze('No (Es de día o llueve)');
  assert.equal(notOr.root.children[0].rule, 'Negación de disyunción');
  assert.deepEqual(notOr.root.children[0].children[0].added.map((entry) => entry.formula), ['¬p', '¬q']);

  const { tableau: doubleNot } = analyze('No (No llueve)');
  assert.equal(doubleNot.root.children[0].rule, 'Doble negación');
  assert.equal(doubleNot.root.children[0].children[0].added[0].formula, 'p');
});

test('la negación de equivalencia genera las dos alternativas correctas', () => {
  const { tableau } = analyze('No (Llueve si y solo si hace frío)');
  const event = tableau.root.children[0];
  assert.equal(event.rule, 'Negación de equivalencia');
  assert.deepEqual(event.children.map((child) => child.added.map((entry) => entry.formula)), [
    ['p', '¬q'], ['¬p', 'q'],
  ]);
});

test('varias reglas conectadas generan ramas y modelos válidos', () => {
  const { knowledgeBase, tableau } = analyze('Si llueve, entonces hace frío\nLlueve o hace frío');
  assert.equal(tableau.satisfiable, true);
  assert.ok(tableau.models.length > 0);
  for (const { assignment } of tableau.models) {
    assert.ok(knowledgeBase.rules.every((rule) => evaluate(rule.ast, assignment)));
  }
});

test('una entrada no admitida produce un error útil', () => {
  assert.throws(() => analyze('Llueve pero hace frío'), /construcción no admitida/);
  assert.throws(() => analyze('Si llueve entonces'), /condicional|expresión vacía/i);
});

function evaluate(ast, assignment) {
  if (ast.type === 'atom') return assignment[ast.name];
  if (ast.type === 'not') return !evaluate(ast.child, assignment);
  const left = evaluate(ast.left, assignment);
  const right = evaluate(ast.right, assignment);
  if (ast.type === 'and') return left && right;
  if (ast.type === 'or') return left || right;
  if (ast.type === 'implies') return !left || right;
  return left === right;
}