const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const declarations = [...source.matchAll(/^  (?:async )?function (\w+)\(/gm)];
const names = ['asNumber', 'roundMoney', 'entryIsFixed', 'entryHours', 'entryAmount', 'entriesFixedTotal', 'hourlyRate', 'dailyWage', 'invoiceDailyWage', 'invoiceWorkDaysLabel'];
const code = names.map(name => {
  const i = declarations.findIndex(m => m[1] === name);
  return source.slice(declarations[i].index, declarations[i + 1].index);
}).join('\n');
function label(entries, { rate = 12.5, dailyRate, configuredDailyRate = '' } = {}) {
  const ctx = { state: { settings: { defaultRate: rate, dailyRate: configuredDailyRate } }, invoice: { entries, rate, dailyRate } };
  vm.createContext(ctx);
  return vm.runInContext(code + '\ninvoiceWorkDaysLabel(invoice)', ctx);
}
const day = date => ({ date, hours: 8, chargeType: 'hours' });
const fixed = (amount, date = '2026-11-04') => ({ date, fixedAmount: amount, chargeType: 'fixed' });

test('counts logged work dates once and combines all fixed charges before adding days', () => {
  assert.equal(label([day('2026-11-01'), day('2026-11-02')]), '2 work days');
  assert.equal(label([day('2026-11-01'), day('2026-11-01')]), '1 work day');
  assert.equal(label([day('2026-09-29'), fixed(55, '2026-11-02'), fixed(27)]), '1.5 work days');
  assert.equal(label([day('2026-11-01'), day('2026-11-02'), fixed(55), fixed(45)]), '3 work days');
});
test('uses whole days for complete daily wages and half a day for any remainder', () => {
  for (const [amount, expected] of [[0, '0 work days'], [0.01, '0.5 work days'], [82, '0.5 work days'], [100, '1 work day'], [100.01, '1.5 work days'], [200, '2 work days'], [250, '2.5 work days']]) {
    assert.equal(label([fixed(amount)]), expected, String(amount));
  }
  assert.equal(label([fixed(0.1), fixed(0.2)], { dailyRate: 0.3 }), '1 work day');
});
test('adjusts to daily wage, falls back to eight hourly wages, and preserves invoice snapshots', () => {
  assert.equal(label([fixed(100)], { rate: 25 }), '0.5 work days');
  assert.equal(label([fixed(100)], { configuredDailyRate: 50 }), '2 work days');
  assert.equal(label([fixed(100)], { dailyRate: 100, configuredDailyRate: 50 }), '1 work day');
  assert.equal(label([fixed(100)], { rate: 0 }), '');
});
