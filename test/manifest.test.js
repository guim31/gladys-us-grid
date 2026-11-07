// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTION_KEY, PERIOD_MS, TRIGGER_KEYS } from '../src/app.js';
import { DEFAULT_CONFIG, LANGUAGES } from '../src/config.js';
import { WIDGET_KEY } from '../src/widgets.js';
import { DEFAULT_ZONE, ZONE_IDS } from '../src/zones.js';
import { NYC, START, createWorld, csv, withPrice } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const field = (key) => manifest.config_schema.find((f) => f.key === key);

test('identity: name, image, cover, cloud transport, energy category, US', () => {
  assert.equal(manifest.name, 'NYISO New York Grid');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-us-grid:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-us-grid/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['energy']);
  assert.deepEqual(manifest.countries, ['US']);
  // `countries` needs Gladys 5.3.0 (and covers the 5.1.0 of the triggers and widget).
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.equal(manifest.network_discovery, undefined);
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('four triggers, a widget, an action, no scene action', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), TRIGGER_KEYS);
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(keysOf(manifest.actions), [ACTION_KEY]);
  // An action applies no `default` and cannot fill a secret (Gladys#3154, #3155).
  assert.equal(manifest.actions[0].fields, undefined);
  assert.equal(manifest.scene_actions, undefined);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  const valued = manifest.config_schema.filter((f) => f.type !== 'section');
  assert.deepEqual(keysOf(valued).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const f of valued) {
    if (f.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[f.key], f.default, f.key);
    }
  }
  assert.deepEqual(
    field('language').options.map((o) => o.value),
    LANGUAGES,
  );
  assert.equal(field('language').default, 'fr');
  // Number fields have no `step`: integer bounds only, no default (empty = off).
  for (const key of ['price_high', 'price_low', 'low_carbon_high']) {
    assert.equal(field(key).type, 'number');
    assert.ok(Number.isInteger(field(key).min) && Number.isInteger(field(key).max));
    assert.equal(field(key).default, undefined);
  }
});

test('every zone option of the manifest is a zone of the code', () => {
  const lists = [
    field('zones').options,
    ...manifest.scene_triggers.flatMap((t) => (t.fields ?? []).map((f) => f.options)),
    manifest.widgets[0].settings.find((s) => s.key === 'zone').options,
  ];
  for (const options of lists) {
    assert.deepEqual(
      options.map((o) => o.value),
      ZONE_IDS,
    );
  }
  assert.equal(manifest.widgets[0].settings.find((s) => s.key === 'zone').default, DEFAULT_ZONE);
});

test('the widget settings hide each optional block', () => {
  const settings = manifest.widgets[0].settings;
  assert.deepEqual(keysOf(settings), ['zone', 'show_chart', 'show_mix']);
  for (const key of ['show_chart', 'show_mix']) {
    assert.equal(settings.find((s) => s.key === key).default, true);
  }
});

test('the configuration says wholesale, CAISO, and not affiliated with NYISO', () => {
  const intro = field('intro');
  assert.match(intro.description.en, /wholesale, not your electricity rate/);
  assert.match(intro.description.en, /Not affiliated with NYISO/);
  assert.match(intro.description.fr, /Sans lien avec NYISO/);
  assert.ok(intro.links.some((l) => l.url === 'https://github.com/LM1LC3N7/gladys-caiso'));
  for (const link of intro.links) {
    assert.match(link.url, /^https:\/\//);
  }
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('every trigger sends exactly its declared variables, with their types', async (t) => {
  const world = await createWorld({
    config: { language: 'fr', zones: [NYC], price_high: 100, price_low: 20, low_carbon_high: 50 },
  });
  t.after(() => world.app.stop());
  world.clock.advance(PERIOD_MS);
  world.nyiso.prices = () => csv(200, withPrice(150, NYC, '11/07/2026 18:33:00'));
  await world.app.tick();
  world.clock.advance(PERIOD_MS);
  world.nyiso.prices = () => csv(200, withPrice(-1, NYC, '11/07/2026 18:38:00'));
  await world.app.tick();
  assert.ok(world.clock.now() > START);
  const sent = new Map(world.fake.sceneEvents.map((e) => [e.key, e.data]));
  assert.deepEqual([...sent.keys()].sort(), [...TRIGGER_KEYS].sort());
  for (const trigger of manifest.scene_triggers) {
    const data = sent.get(trigger.key);
    assert.deepEqual(Object.keys(data).sort(), keysOf(trigger.variables).sort(), trigger.key);
    for (const variable of trigger.variables) {
      assert.equal(typeof data[variable.key], variable.type, `${trigger.key}.${variable.key}`);
    }
    // The filters compare with the event value of the same key.
    for (const filter of trigger.fields ?? []) {
      assert.ok(
        filter.options.some((o) => o.value === data[filter.key]),
        trigger.key,
      );
    }
  }
});

test('the action has a handler', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action(ACTION_KEY, {});
  assert.equal(ack.success, true, ack.error);
});
