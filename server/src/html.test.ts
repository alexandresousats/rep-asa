import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeRichText } from "./html";

test("salvar a descrição descarta estilo colado e mantém o realce do editor", () => {
  const pasted = sanitizeRichText(
    `<p><span style="color: rgb(0, 102, 204); font-size: 48px; background-color: rgb(17, 17, 17);">R$ 1.722,26</span> <span style="color: green; background-color: #dcfce7">à vista no Pix (-5%)</span></p>`,
  );
  assert.match(pasted, /R\$ 1\.722,26/);
  assert.match(pasted, /à vista no Pix \(-5%\)/);
  assert.doesNotMatch(pasted, /style|font-size|background|color/i);

  const highlight = sanitizeRichText(
    `<p><span style="background-color: rgb(253, 230, 138)">marcado</span></p>`,
  );
  assert.match(highlight, /background-color:\s*rgb\(\s*253\s*,\s*230\s*,\s*138\s*\)/i);
  assert.match(highlight, /marcado/);

  const dangerous = sanitizeRichText(`<p>ok</p><script>alert(1)</script><img src="https://evil.test/x.gif">`);
  assert.match(dangerous, /ok/);
  assert.doesNotMatch(dangerous, /script|alert|img|evil/i);
});
