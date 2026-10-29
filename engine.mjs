const LETTER_ORDER = 'pqrstuvwxyzabcdefghijklmno';
const MAX_EXPANSIONS = 500;
const MAX_DEPTH = 300;

function cleanRule(line) {
  return line
    .replace(/^\s*(?:R\s*\d+\s*:\s*|regla\s*\d+\s*:\s*)/i, '')
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/[.!?;]+$/g, '')
    .trim();
}

function stripOuterParentheses(text) {
  let value = text.trim();
  while (value.startsWith('(') && value.endsWith(')')) {
    let depth = 0;
    let enclosesAll = true;
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === '(') depth += 1;
      if (value[index] === ')') depth -= 1;
      if (depth === 0 && index < value.length - 1) {
        enclosesAll = false;
        break;
      }
      if (depth < 0) break;
    }
    if (!enclosesAll || depth !== 0) break;
    value = value.slice(1, -1).trim();
  }
  return value;
}

function topLevelMatches(text, pattern) {
  const matches = [];
  let depth = 0;
  const depths = [];
  for (let index = 0; index < text.length; index += 1) {
    depths[index] = depth;
    if (text[index] === '(') {
      depth += 1;
    }
    if (text[index] === ')') {
      depth -= 1;
      if (depth < 0) throw new Error('Hay un paréntesis de cierre sin pareja.');
    }
  }
  if (depth !== 0) throw new Error('Hay un paréntesis de apertura sin pareja.');
  const matcher = new RegExp(pattern.source, `${pattern.flags.replace(/[gy]/g, '')}g`);
  for (const match of text.matchAll(matcher)) {
    if (depths[match.index] === 0) matches.push({ index: match.index, text: match[0] });
  }
  return matches;
}

function splitAt(text, matches, position) {
  const match = matches[position];
  return [text.slice(0, match.index).trim(), text.slice(match.index + match.text.length).trim()];
}

function parseExpression(input) {
  let text = stripOuterParentheses(input.trim());
  if (!text) throw new Error('Se encontró una expresión vacía.');

  const equivalences = topLevelMatches(text, /(?<![\p{L}\p{N}_])si\s+y\s+s[oó]lo\s+si(?![\p{L}\p{N}_])/iu);
  if (equivalences.length > 1) {
    throw new Error('Usa una sola equivalencia «si y solo si» por expresión y agrupa el resto con paréntesis.');
  }
  if (equivalences.length === 1) {
    const [left, right] = splitAt(text, equivalences, 0);
    return { type: 'iff', left: parseExpression(left), right: parseExpression(right) };
  }

  const conditionals = topLevelMatches(text, /(?<![\p{L}\p{N}_])entonces(?![\p{L}\p{N}_])/iu);
  if (/^si(?![\p{L}\p{N}_])/iu.test(text) && conditionals.length === 1) {
    const prefixLength = text.match(/^si(?![\p{L}\p{N}_])/iu)[0].length;
    const antecedent = text.slice(prefixLength, conditionals[0].index).trim().replace(/,$/, '').trim();
    const consequent = text.slice(conditionals[0].index + conditionals[0].text.length).trim();
    if (!antecedent || !consequent) throw new Error('La condicional debe tener una forma como «Si llueve, entonces hace frío».');
    return { type: 'implies', left: parseExpression(antecedent), right: parseExpression(consequent) };
  }
  if (conditionals.length) throw new Error('«Entonces» debe formar una condicional «Si A, entonces B».');

  const ifConnectors = topLevelMatches(text, /(?<![\p{L}\p{N}_])si(?![\p{L}\p{N}_])/iu);
  if (ifConnectors.length === 1) {
    const [consequent, antecedent] = splitAt(text, ifConnectors, 0);
    if (consequent && antecedent) {
      return { type: 'implies', left: parseExpression(antecedent), right: parseExpression(consequent) };
    }
  } else if (ifConnectors.length > 1) {
    throw new Error('La expresión contiene varios usos ambiguos de «si». Usa «Si A, entonces B».');
  }

  for (const [pattern, type] of [[/(?<![\p{L}\p{N}_])o(?![\p{L}\p{N}_])/iu, 'or'], [/(?<![\p{L}\p{N}_])y(?![\p{L}\p{N}_])/iu, 'and']]) {
    const connectors = topLevelMatches(text, pattern);
    if (connectors.length) {
      const [left, right] = splitAt(text, connectors, connectors.length - 1);
      if (!left || !right) throw new Error(`El conectivo «${connectors[connectors.length - 1].text}» necesita una expresión a cada lado.`);
      return { type, left: parseExpression(left), right: parseExpression(right) };
    }
  }

  const negation = text.match(/^no(?![\p{L}\p{N}_])\s*/iu);
  if (negation) {
    const rest = text.slice(negation[0].length).trim();
    if (!rest) throw new Error('«No» debe ir seguido de una proposición.');
    return { type: 'not', child: parseExpression(rest) };
  }

  if (/[()]/.test(text)) throw new Error('Revisa los paréntesis: solo se admiten alrededor de expresiones completas.');
  if (/(?<![\p{L}\p{N}_])(?:pero|aunque|porque|quizá|quiza|a veces|siempre|nunca)(?![\p{L}\p{N}_])/iu.test(text)) {
    throw new Error('La frase contiene una construcción no admitida. Reformúlala con «y», «o», «no», «si... entonces» o «si y solo si».');
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s'’-]*$/u.test(text)) {
    throw new Error(`No pude interpretar «${text}». Usa proposiciones simples y los conectivos admitidos.`);
  }
  const name = text.toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
  return { type: 'atom', name };
}

function collectAtoms(ast, atoms) {
  if (ast.type === 'atom') {
    if (!atoms.has(ast.name)) atoms.set(ast.name, LETTER_ORDER[atoms.size] ?? `a${atoms.size - LETTER_ORDER.length + 1}`);
    return;
  }
  if (ast.type === 'not') return collectAtoms(ast.child, atoms);
  collectAtoms(ast.left, atoms);
  collectAtoms(ast.right, atoms);
}

function precedence(ast) {
  if (ast.type === 'atom') return 5;
  if (ast.type === 'not') return 4;
  if (ast.type === 'and') return 3;
  if (ast.type === 'or') return 2;
  return 1;
}

function formatFormula(ast, atoms, parentPrecedence = 0) {
  let result;
  if (ast.type === 'atom') result = atoms.get(ast.name);
  else if (ast.type === 'not') {
    const child = formatFormula(ast.child, atoms, 0);
    result = `¬${ast.child.type === 'atom' || ast.child.type === 'not' ? child : `(${child})`}`;
  } else {
    const symbol = { and: '∧', or: '∨', implies: '→', iff: '↔' }[ast.type];
    const childPrecedence = precedence(ast) + (ast.type === 'implies' || ast.type === 'iff' ? 1 : 0);
    result = `${formatFormula(ast.left, atoms, childPrecedence)} ${symbol} ${formatFormula(ast.right, atoms, childPrecedence)}`;
  }
  return precedence(ast) < parentPrecedence ? `(${result})` : result;
}

export function parseKnowledgeBase(input) {
  const lines = input.split(/\r?\n/).map(cleanRule).filter(Boolean);
  if (!lines.length) throw new Error('Escribe al menos una regla, una por línea.');
  const atoms = new Map();
  const rules = lines.map((text, index) => {
    const ast = parseExpression(text);
    collectAtoms(ast, atoms);
    return { id: `R${index + 1}`, text, ast };
  });
  return {
    atoms: [...atoms.entries()].map(([name, letter]) => ({ name, letter, meaning: `${name[0].toLocaleUpperCase('es')}${name.slice(1)}` })),
    rules: rules.map((rule) => ({ ...rule, formula: formatFormula(rule.ast, atoms) })),
  };
}

function isLiteral(ast) {
  return ast.type === 'atom' || (ast.type === 'not' && ast.child.type === 'atom');
}

function expandFormula(ast) {
  if (ast.type === 'not') {
    const child = ast.child;
    if (child.type === 'not') return { rule: 'Doble negación', alternatives: [[child.child]] };
    if (child.type === 'and') return { rule: 'Negación de conjunción', alternatives: [[{ type: 'not', child: child.left }], [{ type: 'not', child: child.right }]] };
    if (child.type === 'or') return { rule: 'Negación de disyunción', alternatives: [[{ type: 'not', child: child.left }, { type: 'not', child: child.right }]] };
    if (child.type === 'implies') return { rule: 'Negación de implicación', alternatives: [[child.left, { type: 'not', child: child.right }]] };
    if (child.type === 'iff') return { rule: 'Negación de equivalencia', alternatives: [[child.left, { type: 'not', child: child.right }], [{ type: 'not', child: child.left }, child.right]] };
  }
  if (ast.type === 'and') return { rule: 'Conjunción', alternatives: [[ast.left, ast.right]] };
  if (ast.type === 'or') return { rule: 'Disyunción', alternatives: [[ast.left], [ast.right]] };
  if (ast.type === 'implies') return { rule: 'Implicación', alternatives: [[{ type: 'not', child: ast.left }], [ast.right]] };
  if (ast.type === 'iff') return { rule: 'Equivalencia', alternatives: [[ast.left, ast.right], [{ type: 'not', child: ast.left }, { type: 'not', child: ast.right }]] };
  throw new Error('Se intentó expandir una fórmula que no tiene regla de tableau.');
}

function findContradiction(records) {
  const signs = new Map();
  for (const record of records) {
    if (!isLiteral(record.ast)) continue;
    const negative = record.ast.type === 'not';
    const atom = negative ? record.ast.child.name : record.ast.name;
    const previous = signs.get(atom);
    if (previous && previous.negative !== negative) return `${previous.formula} y ${record.formula}`;
    signs.set(atom, { negative, formula: record.formula });
  }
  return null;
}

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

function modelFor(records, atoms, rules) {
  const assignment = Object.fromEntries(atoms.map((atom) => [atom.name, false]));
  for (const record of records) {
    if (!isLiteral(record.ast)) continue;
    const negative = record.ast.type === 'not';
    assignment[negative ? record.ast.child.name : record.ast.name] = !negative;
  }
  if (!rules.every((rule) => evaluate(rule.ast, assignment))) {
    throw new Error('Error interno: una rama abierta no produjo un modelo válido para todas las reglas.');
  }
  return assignment;
}

export function buildTableau(knowledgeBase) {
  let nextId = 0;
  let expansions = 0;
  const models = [];
  const root = {
    id: nextId++, kind: 'root', label: 'Base de conocimiento',
    added: knowledgeBase.rules.map((rule) => ({ ast: rule.ast, formula: `${rule.id}: ${rule.formula}`, origin: rule.id })),
    children: [],
  };

  function walk(node, records, depth) {
    if (depth > MAX_DEPTH || expansions > MAX_EXPANSIONS) {
      throw new Error('El tableau superó el límite de seguridad. Prueba con menos reglas o una fórmula más pequeña.');
    }
    const contradiction = findContradiction(records);
    if (contradiction) {
      node.status = 'closed';
      node.contradiction = contradiction;
      return;
    }
    const index = records.findIndex((record) => !record.applied && !isLiteral(record.ast));
    if (index < 0) {
      node.status = 'open';
      const assignment = modelFor(records, knowledgeBase.atoms, knowledgeBase.rules);
      node.model = assignment;
      const key = JSON.stringify(knowledgeBase.atoms.map((atom) => assignment[atom.name]));
      if (!models.some((model) => model.key === key)) models.push({ key, assignment, terminalId: node.id });
      return;
    }

    expansions += 1;
    const current = records[index];
    const nextRecords = records.map((record, recordIndex) => recordIndex === index ? { ...record, applied: true } : record);
    const expansion = expandFormula(current.ast);
    const event = {
      id: nextId++, kind: 'expansion', applied: current.formula,
      rule: expansion.rule, added: [], children: [],
    };
    node.children.push(event);

    expansion.alternatives.forEach((alternative, alternativeIndex) => {
      const derived = alternative.map((ast) => ({
        ast,
        formula: formatFormula(ast, new Map(knowledgeBase.atoms.map((atom) => [atom.name, atom.letter]))),
        origin: current.formula,
        rule: expansion.rule,
        applied: false,
      }));
      const child = {
        id: nextId++, kind: expansion.alternatives.length > 1 ? 'alternative' : 'step',
        label: expansion.alternatives.length > 1 ? `Alternativa ${alternativeIndex + 1}` : '',
        added: derived, children: [],
      };
      event.children.push(child);
      walk(child, [...nextRecords, ...derived], depth + 1);
    });
  }

  const initialRecords = root.added.map((entry) => ({ ...entry, applied: false }));
  walk(root, initialRecords, 0);
  const openBranches = countTerminals(root, 'open');
  return {
    root,
    models: models.map(({ assignment, terminalId }) => ({ assignment, terminalId })),
    branches: { open: openBranches, closed: countTerminals(root, 'closed') },
    satisfiable: openBranches > 0,
  };
}

function countTerminals(node, status) {
  return (node.status === status ? 1 : 0) + node.children.reduce((sum, child) => sum + countTerminals(child, status), 0);
}

export function analyze(input) {
  const knowledgeBase = parseKnowledgeBase(input);
  return { knowledgeBase, tableau: buildTableau(knowledgeBase) };
}