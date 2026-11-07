// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and a fake NYISO
// serving real answers: devices, states (never from a stale or failed read),
// the container's own timer, the triggers (once per crossing, kept across a
// restart), the widget and the test action.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { PERIOD_MS, TICK_MS } from '../src/app.js';
import { PRICE_MAX_AGE_MS } from '../src/devices.js';
import { WIDGET_KEY } from '../src/widgets.js';
import {
  LONG_ISLAND,
  NYC,
  PRICES_CSV,
  START,
  createAll,
  createClock,
  createFakeNyiso,
  createWorld,
  csv,
  gridId,
  withPrice,
  zoneId,
} from './helpers/world.js';

const widget = (world, settings = {}, language = 'fr') =>
  world.fake.widgetGet(WIDGET_KEY, { settings, language, units: 'metric' });

test('discovery: the grid, and one device per zone followed', async (t) => {
  const world = await createWorld({ config: { language: 'en', zones: [NYC, LONG_ISLAND] } });
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => d.name),
    ['New York power grid', 'NYISO New York City (J)', 'NYISO Long Island (K)'],
  );
  assert.equal(devices[1].external_id, zoneId(world.gladys, NYC).device);
  assert.match(devices[1].external_id, /nyiso-61761$/);
});

test('added devices get every figure at once, in kW and $/MWh', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  // Nothing added yet: nothing published.
  assert.equal(world.fake.states.length, 0);
  await createAll(world);
  const grid = gridId(world.gladys);
  const nyc = zoneId(world.gladys, NYC);
  assert.equal(world.fake.lastState(nyc.feature('price')), 32.46);
  assert.ok(world.fake.lastState(nyc.feature('zone_load')) > 4_000_000);
  assert.ok(world.fake.lastState(grid.feature('consumption')) > 15_000_000);
  assert.equal(world.fake.lastState(grid.feature('carbon_intensity')), 238);
  assert.equal(world.fake.lastState(grid.feature('low_carbon_share')), 54);
  assert.equal(world.fake.lastState(grid.feature('renewable_share')), 30);
  assert.equal(world.fake.lastState(grid.feature('nuclear_share')), 24);
  assert.equal(world.fake.lastState(grid.feature('other_fossil_share')), 0);
  assert.match(
    world.fake.lastState(grid.feature('summary')),
    /^16,\d GW consommés, 54 % bas carbone, 238 g CO₂\/kWh, New York City 32,46 \$\/MWh$/,
  );
  assert.ok(world.fake.widgetRefreshes.includes(WIDGET_KEY));
});

test('only the changes are published, and nothing from a stale or failed read', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const nyc = zoneId(world.gladys, NYC).feature('price');
  const count = world.fake.states.length;
  world.clock.advance(PERIOD_MS);
  await world.app.tick();
  assert.equal(world.fake.states.length, count, 'same figures: nothing sent');

  world.nyiso.prices = () => csv(200, withPrice(-3.5));
  world.clock.advance(PERIOD_MS);
  await world.app.tick();
  assert.equal(world.fake.lastState(nyc), -3.5);

  // NYISO down for an hour: the last price stays, no zero is ever sent.
  world.nyiso.prices = () => csv(503, 'down');
  world.nyiso.mix = () => csv(503, 'down');
  const before = world.fake.states.length;
  for (let i = 0; i < 12; i += 1) {
    world.clock.advance(PERIOD_MS);
    await world.app.tick();
  }
  // Only the summary loses the figures that aged out; no number is sent.
  assert.deepEqual(
    world.fake.states.slice(before).filter((s) => s.text === undefined),
    [],
  );
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.deepEqual(Object.keys(world.fake.connectionStatus.message), ['en', 'fr', 'de', 'es']);

  world.nyiso.prices = () => csv(200, PRICES_CSV);
  world.clock.advance(PERIOD_MS);
  await world.app.tick();
  // The price file still says 18:25, more than 30 minutes ago: stale.
  assert.ok(world.clock.now() - Date.parse(world.app.prices.at) > PRICE_MAX_AGE_MS);
  assert.equal(world.fake.lastState(nyc), -3.5);
  assert.equal(world.fake.connectionStatus.connected, false, 'the mix is still down');
});

test('the container reads NYISO on its own timer, without the core polling', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock();
  const world = await createWorld({ clock, timers: true });
  t.after(() => world.app.stop());
  await createAll(world);
  const calls = world.nyiso.count('prices');
  for (let i = 0; i < 5; i += 1) {
    clock.advance(TICK_MS);
    t.mock.timers.tick(TICK_MS);
    await new Promise((resolve) => setImmediate(resolve));
    await world.app.tick();
  }
  assert.equal(world.nyiso.count('prices'), calls + 1, 'one read per five minutes');
});

test('the core poll is only a fallback of the timer', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const calls = world.nyiso.count('prices');
  await world.fake.poll(world.fake.discoveredDevices[0]);
  assert.equal(world.nyiso.count('prices'), calls);
  world.clock.advance(PERIOD_MS);
  await world.fake.poll(world.fake.discoveredDevices[0]);
  assert.equal(world.nyiso.count('prices'), calls + 1);
});

test('nothing followed, nothing shown: NYISO is not read', async (t) => {
  const world = await createWorld({ config: { language: 'fr' } });
  t.after(() => world.app.stop());
  const calls = world.nyiso.calls.length;
  world.clock.advance(PERIOD_MS * 3);
  await world.app.tick();
  assert.equal(world.nyiso.calls.length, calls);
});

test('price triggers: once per crossing, re-armed past the margin', async (t) => {
  const world = await createWorld({
    config: { language: 'fr', zones: [NYC], price_high: 100, price_low: '20' },
  });
  t.after(() => world.app.stop());
  const keys = () => world.fake.sceneEvents.map((e) => e.key);
  assert.deepEqual(keys(), []); // 32.46: between the thresholds

  const step = async (price) => {
    world.clock.advance(PERIOD_MS);
    world.nyiso.prices = () => csv(200, withPrice(price, NYC, stampOf(world.clock.now())));
    await world.app.tick();
  };
  await step(150);
  await step(180);
  await step(98); // not 5 below the threshold yet: still on
  await step(120);
  assert.deepEqual(keys(), ['price_above']);
  assert.deepEqual(world.fake.sceneEvents[0].data, {
    zone: NYC,
    zone_name: 'New York City',
    price: 150,
    threshold: 100,
  });
  await step(90); // re-armed
  await step(101);
  assert.deepEqual(keys(), ['price_above', 'price_above']);
  await step(-2);
  assert.deepEqual(keys(), ['price_above', 'price_above', 'price_below', 'negative_price']);
  assert.deepEqual(world.fake.sceneEvents[3].data, {
    zone: NYC,
    zone_name: 'New York City',
    price: -2,
  });
  await step(-8);
  assert.equal(keys().length, 4);
  // A zone not followed never fires.
  world.clock.advance(PERIOD_MS);
  world.nyiso.prices = () => csv(200, withPrice(500, LONG_ISLAND, stampOf(world.clock.now())));
  await world.app.tick();
  assert.equal(keys().length, 4);
});

test('a restart does not fire again; a new threshold starts afresh', async (t) => {
  const config = { language: 'fr', zones: [NYC], price_high: 30 };
  const first = await createWorld({ config });
  await first.app.stop();
  assert.deepEqual(
    first.fake.sceneEvents.map((e) => e.key),
    ['price_above'],
  );
  const again = await createWorld({ config, dataDir: first.dataDir });
  t.after(() => again.app.stop());
  assert.deepEqual(again.fake.sceneEvents, []);
  await again.fake.configUpdated({ ...config, price_high: 31 });
  assert.deepEqual(
    again.fake.sceneEvents.map((e) => e.key),
    ['price_above'],
  );
  // No threshold: the trigger is off and forgotten.
  await again.fake.configUpdated({ language: 'fr', zones: [NYC] });
  assert.equal(again.app.triggers.price_above, undefined);
});

test('the low-carbon trigger, with its figures', async (t) => {
  const world = await createWorld({ config: { language: 'fr', low_carbon_high: 50 } });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.sceneEvents, [
    {
      key: 'low_carbon_above',
      data: { low_carbon_share: 54, renewable_share: 30, carbon_intensity: 238, threshold: 50 },
    },
  ]);
  // The threshold makes the mix read even without any device.
  const calls = world.nyiso.count('mix');
  world.clock.advance(PERIOD_MS);
  await world.app.tick();
  assert.equal(world.nyiso.count('mix'), calls + 1);
  assert.equal(world.fake.sceneEvents.length, 1);
});

test('the widget: valid content, the zone of its setting, hideable blocks', async (t) => {
  const world = await createWorld({ config: { language: 'fr', price_high: 30 } });
  t.after(() => world.app.stop());
  const ack = await widget(world, { zone: LONG_ISLAND }, 'en');
  assert.equal(ack.success, true, ack.error);
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  const types = content.components.map((c) => c.type);
  assert.deepEqual(types, ['value', 'value', 'value', 'value', 'status', 'text']);
  assert.equal(content.components[0].label, 'Price · Long Island');
  assert.equal(content.components[0].value, 32.68);
  assert.equal(content.components[0].color, 'danger');
  assert.match(content.components.at(-1).text, /^Wholesale prices, not your rate · \d\d:\d\d$/);

  // Devices added: the chart of the zone's price, unless hidden.
  await world.fake.configUpdated({ language: 'fr', zones: [NYC] });
  await createAll(world);
  const withChart = (await widget(world, { zone: NYC })).data.content;
  assert.deepEqual(validateWidgetContent(withChart), []);
  const chart = withChart.components.find((c) => c.type === 'chart');
  assert.deepEqual(chart.device_features, [zoneId(world.gladys, NYC).feature('price')]);
  const bare = (await widget(world, { zone: NYC, show_chart: false, show_mix: false })).data
    .content;
  assert.deepEqual(
    bare.components.map((c) => c.type),
    ['value', 'value', 'value', 'value', 'text'],
  );
  // Another zone, without a device: the CO₂ chart of the grid.
  const other = (await widget(world, { zone: LONG_ISLAND })).data.content;
  assert.deepEqual(other.components.find((c) => c.type === 'chart').device_features, [
    gridId(world.gladys).feature('carbon_intensity'),
  ]);
});

test('the widget says so when NYISO cannot be read', async (t) => {
  const nyiso = createFakeNyiso();
  nyiso.prices = () => csv(503, 'down');
  nyiso.mix = () => csv(503, 'down');
  nyiso.load = () => csv(503, 'down');
  const world = await createWorld({ nyiso });
  t.after(() => world.app.stop());
  const content = (await widget(world, {}, 'de')).data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.deepEqual(content.components, [
    {
      type: 'text',
      variant: 'body',
      text: 'NYISO ist gerade nicht erreichbar: lieber keine Zahl als eine veraltete.',
    },
  ]);
});

test('the test action answers in the configured language, and fails clearly', async (t) => {
  const world = await createWorld({ config: { language: 'es', zones: [LONG_ISLAND] } });
  t.after(() => world.app.stop());
  const ok = await world.fake.action('test_connection', {});
  assert.equal(ok.success, true, ok.error);
  assert.match(
    ok.data.message ?? ok.data,
    /^NYISO responde: Long Island 32,68 \$\/MWh \(\d\d:\d\d\), 54 % bajo en carbono\.$/,
  );
  world.nyiso.prices = () => csv(500, 'oops');
  const failed = await world.fake.action('test_connection', {});
  assert.equal(failed.success, false);
  assert.match(failed.error, /No se puede leer el archivo de precios de NYISO/);
});

/** "11/07/2026 18:30:00", the New York wall clock of an instant (EST). */
function stampOf(at) {
  const date = new Date(at - 5 * 3_600_000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:00`;
}

test('stampOf matches the fixture clock', () => {
  assert.equal(stampOf(START), '11/07/2026 18:28:00');
});
