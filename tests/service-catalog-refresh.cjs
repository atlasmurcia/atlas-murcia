const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const agenda = fs.readFileSync(path.join(__dirname, '../modules/agenda.html'), 'utf8');
const ordering = agenda.match(/function orderedAppointmentTherapies\(names\)\{[\s\S]*?(?=function renderServiceChecks\()/)[0];
const source = ordering + agenda.match(/function renderServiceChecks\(\)\{[\s\S]*?(?=function buildMultiSelectors\()/)[0];

// Minimal DOM: exercise the real refresh with synthetic catalogue entries only.
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.value = ''; }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; this.value = ''; }
  get options() { return this.children; }
}
const elements = Object.fromEntries(['mServicesOptions', 'mTherapy', 'wService', 'pfService'].map(id => [id, new Element(id)]));
let selected = ['Fisioterapia'];
let summaries = 0;
const context = {
  therapies: ['Fisioterapia'],
  checkedValues: () => selected,
  updateMultiSummaries: () => summaries++,
  document: {
    getElementById: id => elements[id],
    createElement: tag => new Element(tag),
    createTextNode: text => ({textContent: text})
  }
};
vm.createContext(context);
vm.runInContext(source, context);
context.renderServiceChecks();
elements.mTherapy.value = 'Fisioterapia';
elements.wService.value = 'Cualquiera';
elements.pfService.value = 'Fisioterapia';

// Central settings can arrive after the initial form has already been built.
context.therapies.push('MASAJE CL AFILIADOS', 'Synthetic "quoted" <service>');
context.renderServiceChecks();
const checks = () => elements.mServicesOptions.children.map(label => label.children[0]);
assert(checks().some(input => input.value === 'MASAJE CL AFILIADOS'));
assert.equal(checks().find(input => input.value === 'Fisioterapia').checked, true);
assert.equal(checks().find(input => input.value === 'MASAJE CL AFILIADOS').checked, false);
assert(checks().some(input => input.value === 'Synthetic "quoted" <service>'));
for (const id of ['mTherapy', 'wService', 'pfService']) {
  assert(elements[id].options.some(option => option.value === 'MASAJE CL AFILIADOS'));
}
assert.equal(elements.mTherapy.value, 'Fisioterapia');
assert.equal(elements.wService.value, 'Cualquiera');
assert.equal(elements.pfService.value, 'Fisioterapia');
selected = ['MASAJE CL AFILIADOS'];
context.renderServiceChecks();
assert.equal(checks().find(input => input.value === 'MASAJE CL AFILIADOS').checked, true);
assert.equal(checks().length, 3, 'Repeated refreshes must not duplicate options');
context.therapies.splice(0);
context.renderServiceChecks();
assert.equal(checks().length, 0, 'An empty active catalogue must clear stale choices');
assert.equal(elements.mTherapy.options.length, 0);
assert.equal(summaries, 4);

// Both central loading and local catalogue saves must invoke the refresh.
for (const name of ['applyRuntimeSettings', 'persistSales']) {
  const body = agenda.split('function ' + name + '(')[1].split('\n')[0];
  assert(body.includes('renderServiceChecks()'), name + ' must refresh the visible form');
}
for (const match of agenda.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
console.log('Service catalogue refresh: OK (synthetic data; all agenda scripts parse)');
