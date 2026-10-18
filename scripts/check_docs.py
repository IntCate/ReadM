#!/usr/bin/env python3
"""Check documentation references and traceability; never claims semantic correctness."""
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'


def render(data):
    labels = {'user-confirmed': '用户明确', 'proposed-baseline': '建议基线', 'optional': '候选增强'}
    lines = ['# 需求与追踪', '',
             f"基线 {data['baseline']}，日期 {data['date']}。此表由 traceability.json 生成，不独立手改。",
             '', '用户明确表示业务目标；附属默认参数、实现分解和技术方案仍属于专业规格建议，不能据此声称每个细节均已确认。未来端当前只验证可扩展边界，不实施原生客户端。', '',
             '阶段：P1/P2/P3 为业务阶段；P1-P3 为贯穿约束；FUTURE 为未来端需求；OPTIONAL 不纳入当前必做验收。', '',
             '| 需求 ID | 需求 | 阶段 | 状态 | 专业规格 | 用例 | 工作包 |',
             '|---|---|---|---|---|---|---|']
    for r in data['requirements']:
        links = '、'.join(f'[{Path(s).stem}]({s})' for s in r['specs'])
        lines.append(f"| {r['id']} | {r['title']} | {r['phase']} | {labels[r['status']]} | {links} | {', '.join(r['tests'])} | {', '.join(r['tasks'])} |")
    lines += ['', '需求状态不代表完成状态。当前实现与实测状态见 [第一阶段实现与验证](第一阶段实现与验证.md)；文档检查与产品验收分别记录。', '',
              '未决项和限制见 [风险与待决策](风险与待决策.md)，开发依赖见 [开发与发布计划](开发与发布计划.md)，变更规则见 [文档治理](文档治理.md)。', '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true', help='Regenerate the requirement table')
    args = parser.parse_args()
    data = json.loads((DOCS / 'traceability.json').read_text())
    generated = render(data)
    target = DOCS / '需求与追踪.md'
    if args.write:
        target.write_text(generated)
    errors = []

    def check(ok, message):
        if not ok:
            errors.append(message)

    check(target.exists() and target.read_text() == generated, '需求与追踪.md 过期：运行 --write')
    documents = data['documents']
    check(len(documents) == len(set(documents)), '文档登记重复')
    for name in documents:
        check((DOCS / name).is_file(), f'文档缺失：{name}')
    actual = {p.name for p in DOCS.glob('*.md')}
    check(actual == set(documents), f'文档清单差异：{sorted(actual ^ set(documents))}')

    requirements = data['requirements']
    ids = [r['id'] for r in requirements]
    check(len(ids) == len(set(ids)), '需求 ID 重复')
    phases = {'P1', 'P2', 'P3', 'P1-P3', 'FUTURE', 'OPTIONAL'}
    statuses = {'user-confirmed', 'proposed-baseline', 'optional'}
    for r in requirements:
        check(bool(re.fullmatch(r'REQ-\d{2}', r['id'])), f"非法需求 ID：{r['id']}")
        check(r['phase'] in phases and r['status'] in statuses, f"阶段/状态非法：{r['id']}")
        check((r['phase'] == 'OPTIONAL') == (r['status'] == 'optional'), f"候选范围不一致：{r['id']}")
        for field, catalog in [('tests', data['test_catalog']), ('tasks', data['task_catalog'])]:
            check(bool(r[field]), f"缺少追踪：{r['id']} {field}")
            for ref in r[field]:
                check(ref in catalog, f"悬空追踪：{r['id']} → {ref}")
        check(bool(r['specs']) and bool(r['source']), f"规格或来源为空：{r['id']}")
        for spec in r['specs']:
            check(spec in documents, f"未登记规格：{r['id']} → {spec}")

    for kind, pattern in [('test_catalog', r'T-\d{2}'), ('task_catalog', r'W-\d{2}')]:
        catalog = data[kind]
        for item, name in catalog.items():
            path = DOCS / name
            definitions = re.findall(r'^\| (' + pattern + r') \|', path.read_text(), re.M) if path.exists() else []
            check(definitions.count(item) == 1, f'缺少或重复条目定义：{item} in {name}')
        traced = {v for r in requirements for v in r['tests' if kind == 'test_catalog' else 'tasks']}
        check(set(catalog) == traced, f'没有需求归属的条目：{sorted(set(catalog) - traced)}')

    tasks = data['task_catalog']
    dependencies = data['task_dependencies']
    check(set(tasks) == set(dependencies), '任务依赖清单与任务目录不一致')
    plan = (DOCS / '开发与发布计划.md').read_text()
    for item, refs in dependencies.items():
        for ref in refs:
            check(ref in tasks, f'任务依赖不存在：{item} → {ref}')
        row = re.search(r'^\| ' + item + r' \|([^\n]+)', plan, re.M)
        if row:
            columns = row.group(1).split('|')
            written = set(re.findall(r'W-\d{2}', columns[1]))
            check(written == set(refs), f'计划与机器任务依赖不一致：{item}')
    visiting, done = set(), set()

    def visit(item):
        if item in visiting:
            errors.append(f'任务循环依赖：{item}')
            return
        if item in done:
            return
        visiting.add(item)
        for ref in dependencies.get(item, []):
            visit(ref)
        visiting.remove(item)
        done.add(item)

    for item in dependencies:
        visit(item)

    known = set(ids) | set(data['test_catalog']) | set(tasks)
    for path in DOCS.rglob('*.md'):
        content = path.read_text()
        for raw in re.findall(r'\[[^\]]+\]\(([^)]+)\)', content):
            url = urlparse(raw)
            if url.scheme or not url.path:
                continue
            resolved = (path.parent / unquote(url.path)).resolve()
            check(resolved.is_file(), f'文件链接失效：{path.relative_to(ROOT)} → {raw}')
        if 'research' not in path.parts:
            for ref in set(re.findall(r'\b(?:REQ|T|W)-\d{2}\b', content)):
                check(ref in known, f'未登记 ID：{path.name} → {ref}')
    if errors:
        print('\n'.join(f'ERROR: {e}' for e in errors))
        return 1
    print(f"PASS: {len(documents)} 份当前文档；{len(ids)} 项需求；"
          f"{len(data['test_catalog'])} 个用例；{len(tasks)} 个工作包；链接、追踪、生成表与任务依赖一致。")
    print('限制：静态检查不证明语义正确、外链有效或应用测试通过。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
