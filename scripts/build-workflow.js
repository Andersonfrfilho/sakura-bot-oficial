#!/usr/bin/env node
// Concatena os módulos src/ e injeta o JS compilado no workflow JSON
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC  = path.join(ROOT, 'src');

const MODULE_ORDER = [
  'setup.js',
  'handlers/global.js',
  'handlers/greeting.js',
  'handlers/cart.js',
  'handlers/delivery.js',
  'handlers/payment.js',
  'handlers/menu-shortcuts.js',
  'handlers/reservation.js',
  'handlers/misc.js',
  'handlers/ordering.js',
  'handlers/fallback.js',
  'teardown.js',
];

const WORKFLOW_FILES = {
  '01-receber-mensagem.json': 'Rotear e Responder',
};

function build() {
  const parts = MODULE_ORDER.map(rel => {
    const p = path.join(SRC, rel);
    if (!fs.existsSync(p)) throw new Error('Módulo não encontrado: ' + p);
    return fs.readFileSync(p, 'utf8');
  });

  const code = parts.join('\n\n');
  const lines = code.split('\n').length;
  console.log('✅ Build: ' + lines + ' linhas de ' + MODULE_ORDER.length + ' módulos');

  // Injeta em cada workflow configurado
  const wfDir = path.join(ROOT, 'n8n', 'workflows');
  for (const [file, nodeName] of Object.entries(WORKFLOW_FILES)) {
    const wfPath = path.join(wfDir, file);
    if (!fs.existsSync(wfPath)) { console.warn('⚠ Workflow não encontrado: ' + file); continue; }
    const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
    let injected = false;
    for (const node of wf.nodes) {
      if (node.name === nodeName && node.type === 'n8n-nodes-base.code') {
        node.parameters.jsCode = code;
        injected = true;
        break;
      }
    }
    if (!injected) { console.warn('⚠ Nó não encontrado em ' + file + ': ' + nodeName); continue; }
    fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2));
    console.log('✅ Injetado em: ' + file + ' → nó "' + nodeName + '"');
  }
}

build();
