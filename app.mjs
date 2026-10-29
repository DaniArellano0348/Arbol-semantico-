import { analyze } from './engine.mjs';

const EXAMPLE = [
  'R1: Si es de día, entonces voy a trabajar.',
  'R2: Si llueve, entonces no voy a trabajar.',
  'R3: Es de día.',
].join('\n');

const input = document.querySelector('#rules-input');
const results = document.querySelector('#results');
const errorMessage = document.querySelector('#error-message');
const formulaOutput = document.querySelector('#formulas-output');
const atomsOutput = document.querySelector('#atoms-output');
const treeCanvas = document.querySelector('#tree-canvas');
const outcomesOutput = document.querySelector('#outcomes-output');
const zoomValue = document.querySelector('#zoom-value');
let zoom = 1;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function renderFormulaList(rules) {
  formulaOutput.innerHTML = rules.map((rule) => `
    <div class="formula-row">
      <span class="formula-id">${escapeHtml(rule.id)}</span>
      <span class="formula-text">${escapeHtml(rule.text)}</span>
      <span class="formula-symbol">${escapeHtml(rule.formula)}</span>
    </div>`).join('');
}

function renderAtoms(atoms) {
  atomsOutput.innerHTML = atoms.map((atom) => `
    <tr><td>${escapeHtml(atom.letter)}</td><td>${escapeHtml(atom.meaning)}</td></tr>`).join('');
}

function renderTreeNode(node) {
  const status = node.status ? ` data-status="${node.status}"` : '';
  const label = node.label || (node.kind === 'root' ? 'Base inicial' : node.kind === 'expansion' ? 'Expansión' : '');
  const badge = node.status === 'closed' ? '✕ Cerrada' : node.status === 'open' ? 'Abierta' : '';
  const formulas = node.added.map((entry) => `
    <div class="tree-formula" title="${escapeHtml(entry.origin ? `Derivada de ${entry.origin}${entry.rule ? ` · ${entry.rule}` : ''}` : '')}">
      <span class="formula-text">${escapeHtml(entry.formula)}</span>
      ${entry.applied ? '<span class="applied-label">Aplicada</span>' : ''}
    </div>`).join('');
  const applied = node.applied ? `<div class="tree-rule">${escapeHtml(node.rule)} · aplicada a ${escapeHtml(node.applied)}</div>` : '';
  const contradiction = node.contradiction ? `<div class="tree-note">Contradicción: ${escapeHtml(node.contradiction)}</div>` : '';
  const children = node.children.length
    ? `<div class="tree-children">${node.children.map(renderTreeNode).join('')}</div>`
    : '';
  return `<div class="tree-node"${status}>
    <article class="tree-card">
      <div class="tree-card-head"><span class="tree-label">${escapeHtml(label)}</span><span class="tree-status">${badge}</span></div>
      ${applied}${formulas}${contradiction}
    </article>${children}
  </div>`;
}

function collectTerminalBranches(node, path = [], branches = []) {
  const nextPath = [...path, ...node.added.map((entry) => entry.formula)];
  if (node.status) branches.push({ node, path: nextPath });
  node.children.forEach((child) => collectTerminalBranches(child, nextPath, branches));
  return branches;
}

function renderOutcomes(tableau, atoms) {
  const terminals = collectTerminalBranches(tableau.root);
  outcomesOutput.innerHTML = terminals.map(({ node, path }, index) => {
    const open = node.status === 'open';
    const assignment = node.model;
    const values = assignment ? `<div class="model-values">${atoms.map((atom) => {
      const truth = assignment[atom.name];
      return `<span class="model-value${truth ? '' : ' is-false'}"><b>${escapeHtml(atom.letter)}</b> = ${truth ? 'V' : 'F'}</span>`;
    }).join('')}</div>` : '';
    const detail = open
      ? '<p>La rama está saturada. Esta asignación satisface todas las reglas originales.</p>'
      : `<p>La rama contiene literales opuestos: ${escapeHtml(node.contradiction)}.</p>`;
    return `<article class="outcome ${open ? 'open' : 'closed'}">
      <div class="outcome-head"><span>Rama terminal ${index + 1}</span><span>${open ? 'Abierta' : '✕ Cerrada'}</span></div>
      ${detail}${values}
      <p class="visually-hidden">Fórmulas en la rama: ${escapeHtml(path.join(', '))}</p>
    </article>`;
  }).join('');
}

function render({ knowledgeBase, tableau }, shouldScroll = true) {
  const { atoms, rules } = knowledgeBase;
  document.querySelector('#result-title').textContent = tableau.satisfiable ? 'Base de conocimiento SATISFACIBLE' : 'Base de conocimiento INSATISFACIBLE';
  document.querySelector('#result-description').textContent = tableau.satisfiable
    ? 'Existe al menos una asignación que hace verdaderas todas las reglas.'
    : 'Todas las ramas se cerraron; no existe una asignación que satisfaga simultáneamente las reglas.';
  document.querySelector('#result-stamp').textContent = tableau.satisfiable ? '✓' : '×';
  document.querySelector('.summary-band').classList.toggle('is-unsat', !tableau.satisfiable);
  document.querySelector('#branch-counts').innerHTML = `
    <span><strong>${tableau.branches.open}</strong> abiertas</span>
    <span><strong>${tableau.branches.closed}</strong> cerradas</span>`;
  renderFormulaList(rules);
  renderAtoms(atoms);
  treeCanvas.innerHTML = renderTreeNode(tableau.root);
  renderOutcomes(tableau, atoms);
  results.hidden = false;
  errorMessage.hidden = true;
  if (shouldScroll) results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function runAnalysis(shouldScroll = true) {
  try {
    render(analyze(input.value), shouldScroll);
  } catch (error) {
    errorMessage.textContent = error instanceof Error ? error.message : 'No se pudo analizar la entrada.';
    errorMessage.hidden = false;
    results.hidden = true;
  }
}

document.querySelector('#analyze-button').addEventListener('click', runAnalysis);
document.querySelector('#example-button').addEventListener('click', () => {
  input.value = EXAMPLE;
  runAnalysis();
});
document.querySelector('#clear-button').addEventListener('click', () => {
  input.value = '';
  results.hidden = true;
  errorMessage.hidden = true;
  input.focus();
});
document.querySelector('#zoom-in').addEventListener('click', () => setZoom(zoom + 0.1));
document.querySelector('#zoom-out').addEventListener('click', () => setZoom(zoom - 0.1));
document.querySelector('#zoom-reset').addEventListener('click', () => setZoom(1));

function setZoom(value) {
  zoom = Math.min(1.5, Math.max(0.6, Math.round(value * 10) / 10));
  treeCanvas.style.zoom = zoom;
  zoomValue.value = `${Math.round(zoom * 100)}%`;
}

input.value = EXAMPLE;
runAnalysis(false);