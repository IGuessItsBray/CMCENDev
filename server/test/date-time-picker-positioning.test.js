const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pickerScript = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'date-time-picker.js'),
  'utf8',
);
const styles = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'styles.css'),
  'utf8',
);

test('keeps the date and time picker within the viewport', () => {
  assert.match(
    pickerScript,
    /function positionPopover\(\)[\s\S]*?const spaceAbove = triggerRect\.top - viewportPadding;[\s\S]*?const spaceBelow = window\.innerHeight - triggerRect\.bottom - viewportPadding;[\s\S]*?const openAbove =[\s\S]*?spaceBelow < naturalPopoverHeight && spaceAbove > spaceBelow;/u,
  );
  assert.match(
    pickerScript,
    /const top = Math\.max\([\s\S]*?window\.innerHeight - popoverHeight - viewportPadding/u,
  );
  assert.match(
    pickerScript,
    /const availableHeight = Math\.max\([\s\S]*?\(openAbove \? spaceAbove : spaceBelow\) - gap,[\s\S]*?"--date-popover-max-height"/u,
  );
  assert.match(
    pickerScript,
    /if \(picker\.classList\.contains\("is-open"\)\) positionPopover\(\);/u,
  );
  assert.match(
    styles,
    /\.cmcen-date-time-popover \{[\s\S]*?max-height: var\(--date-popover-max-height, calc\(100vh - 24px\)\);[\s\S]*?overflow-y: auto;/u,
  );
});
