const chunks = [];

for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
if (report.error) {
  throw new Error(report.error.message ?? '无法生成第三方许可证报告');
}

const blockedLicensePattern = /(?:^|[\s(])(?:A?GPL|SSPL|BUSL)-|Commons Clause|Unknown/i;
const violations = Object.entries(report)
  .filter(([license]) => blockedLicensePattern.test(license))
  .flatMap(([license, packages]) =>
    packages.map(({ name, version }) => `${name}@${version ?? 'unknown'} (${license})`),
  );

if (violations.length > 0) {
  console.error('[check:licenses] 发现需要人工审核或禁止引入的许可证：');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('[check:licenses] 未发现 GPL/AGPL/SSPL/BUSL/Commons Clause 或许可证未知的生产依赖。');
