#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createDecisionClient } from '../../decisions/dist/index.js';
import { summarize } from '../../eval/index.mjs';
import { configuration, initialize, keyFile } from './config.mjs';
import { agent } from './agent.mjs';

const help = `Jev Decision Kit — 설정, 판단 실행, 평가, 에이전트 연결\n
  jev-decision-kit init                    API 키 설정 (화면에 표시하지 않음)
  jev-decision-kit demo                    준비된 Jev 판단 예제 실행
  jev-decision-kit demo --offline          키 없이 모의 예제 실행
  jev-decision-kit decide --text "..." --question "..." --choices "예,아니오,판단보류"
  jev-decision-kit run FILE.json           정의한 질문 실행
  jev-decision-kit eval FILE.jsonl          관측 결과 집계
  jev-decision-kit eval --demo              준비된 평가 예제 실행
  jev-decision-kit doctor                  API 키 설정 상태 확인
  jev-decision-kit agent install [codex|claude|both]
  jev-decision-kit agent doctor
  jev-decision-kit agent uninstall [codex|claude|both]
`;
function options(args, allowed) {
  const parsed = {};
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (!allowed.includes(name) || Object.hasOwn(parsed, name)) throw new Error('옵션을 확인하세요. jev-decision-kit --help로 사용법을 볼 수 있습니다.');
    if (name === '--offline' || name === '--json') parsed[name] = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${name} 값을 입력하세요.`);
      parsed[name] = value;
    }
  }
  return parsed;
}
function request(text = '계정 설정을 변경하고 싶어요', question = '이 요청은 계정 지원에 관한 문의인가?', choices = ['관련있음', '관련없음', '판단보류']) {
  return { definitionId: 'cli-choice', definitionVersion: '1', state: { message: text },
    questions: { decision: { type: 'choice', instructions: question, criteria: Object.fromEntries(choices.map(choice => [choice, choice])) } } };
}
async function decide(input, flags) {
  const config = configuration();
  if (flags['--model']) config.model = flags['--model'];
  if (flags['--base-url']) config.baseURL = flags['--base-url'];
  if (flags['--offline']) {
    config.apiKey = 'offline-example';
    config.fetch = async () => new Response(JSON.stringify({ model: config.model, answers: {
      decision: { type: 'choice', choice: '관련있음', confidence: 0.97,
        probabilities: { 관련있음: 0.97, 관련없음: 0.02, 판단보류: 0.01 } },
    } }), { headers: { 'content-type': 'application/json' } });
  } else if (!config.apiKey) throw new Error('먼저 jev-decision-kit init을 실행하세요. 키 없이 확인하려면 demo --offline을 사용하세요.');
  const timeoutMs = flags['--timeout-ms'] ? Number(flags['--timeout-ms']) : 1200;
  const result = await createDecisionClient(config).decide(input, { timeoutMs });
  if (flags['--json']) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) {
    if (flags['--offline']) console.log('모의 실행 — 네트워크 호출 없음');
    for (const [name, answer] of Object.entries(result.answers)) console.log(`${name}: ${answer.type === 'choice' ? answer.choice : answer.type === 'score' ? answer.score : answer.noul}`);
    console.log(`처리 시간: ${Math.round(result.meta.durationMs)}ms`);
  } else console.error(`Jev 요청 실패: ${result.error.kind}${result.error.status ? ` (HTTP ${result.error.status})` : ''}`);
  if (!result.ok) process.exitCode = 1;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') return console.log(help);
  if (command === 'init') return initialize(args);
  if (command === 'doctor') {
    if (args.length) throw new Error('사용법: jev-decision-kit doctor');
    const { apiKey, model } = configuration();
    console.log(`API 키: ${apiKey ? '설정됨 (값은 표시하지 않음)' : '설정 필요 — jev-decision-kit init'}\n모델: ${model}\n설정 위치: ${keyFile()}`);
    return;
  }
  if (command === 'demo') return decide(request(), options(args, ['--offline', '--json', '--model', '--timeout-ms', '--base-url']));
  if (command === 'decide') {
    const flags = options(args, ['--text', '--question', '--choices', '--json', '--model', '--timeout-ms', '--base-url']);
    const choices = flags['--choices']?.split(',').map(choice => choice.trim());
    if (!flags['--text'] || !flags['--question'] || !choices || choices.length < 2 || choices.some(choice => !choice) || new Set(choices).size !== choices.length) throw new Error('text·question과 서로 다른 선택지 두 개 이상을 입력하세요. 사용법: jev-decision-kit --help');
    return decide(request(flags['--text'], flags['--question'], choices), flags);
  }
  if (command === 'run') {
    if (!args[0] || args[0].startsWith('--')) throw new Error('사용법: jev-decision-kit run FILE.json');
    let input;
    try { input = JSON.parse(readFileSync(args[0], 'utf8')); } catch { throw new Error('질문 JSON 파일을 읽을 수 없습니다.'); }
    if (!input || typeof input !== 'object' || !input.definitionId || !input.definitionVersion || !input.questions || !Object.hasOwn(input, 'state')) throw new Error('질문 정의에 definitionId, definitionVersion, state, questions가 필요합니다.');
    return decide(input, options(args.slice(1), ['--json', '--model', '--timeout-ms', '--base-url']));
  }
  if (command === 'eval') {
    if (args.length !== 1) throw new Error('사용법: jev-decision-kit eval FILE.jsonl 또는 eval --demo');
    let rows;
    if (args[0] === '--demo') rows = [{ caseId: 'demo', groupId: 'demo', status: 'deferred', correct: null, meta: { durationMs: 120, inputTokens: null, outputTokens: 20 } }];
    else try { rows = readFileSync(args[0], 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line)); }
    catch { throw new Error('평가 파일을 읽을 수 없습니다. 한 줄에 JSON 하나씩 있는 파일을 지정하세요.'); }
    console.log(JSON.stringify(summarize(rows), null, 2)); return;
  }
  if (command === 'agent') return agent(args);
  throw new Error('알 수 없는 명령입니다. jev-decision-kit --help로 사용법을 볼 수 있습니다.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
