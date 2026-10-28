import assert from "node:assert/strict";
import test from "node:test";
import { plainTextToEditorHtml, stripExternalPasteHtml } from "./paste-html";

const storePaste = `<html><body><!--StartFragment--><span style="color: rgb(0, 102, 204); font-size: 48px; font-family: Impact; background-color: rgb(17, 17, 17);">R$ 1.722,26</span> <span style="color: rgb(0, 128, 0); background-color: rgb(220, 252, 231);">à vista no Pix (-5%)</span><!--EndFragment--></body></html>`;

test("colar de um site descarta cor, fonte, tamanho e fundo", () => {
  const html = stripExternalPasteHtml(storePaste);
  assert.match(html, /R\$ 1\.722,26/);
  assert.match(html, /à vista no Pix \(-5%\)/);
  assert.doesNotMatch(html, /style|class|font-size|font-family|background|color:|Impact/i);
});

test("colar preserva parágrafos, quebras, listas, ênfase e links", () => {
  const html = stripExternalPasteHtml(`
    <div style="font-size:40px;color:#00f">Primeira</div>
    <div>Segunda<br>linha</div>
    <p>Veja <a href="https://loja.example/item" class="price" style="color:red"><strong>o produto</strong></a></p>
    <ul><li style="color:green">um</li><li><em>dois</em></li></ul>
  `);
  assert.match(html, /<p>Primeira<\/p>/);
  assert.match(html, /<p>Segunda<br\s*\/?>\s*linha<\/p>/);
  assert.match(html, /<a href="https:\/\/loja\.example\/item"><strong>o produto<\/strong><\/a>/);
  assert.match(html, /<ul><li>um<\/li><li><em>dois<\/em><\/li><\/ul>/);
  assert.doesNotMatch(html, /style|class|font-size|color/i);
});

test("colar descarta script, estilo, imagem e link perigoso", () => {
  const html = stripExternalPasteHtml(
    `<style>p{color:red;font-size:40px}</style><p>visível</p><script>alert(1)</script><img src="https://evil.test/pixel.gif"><a href="javascript:alert(1)">clique</a>`,
  );
  assert.match(html, /visível/);
  assert.doesNotMatch(html, /script|alert|img|evil|javascript|style|font-size/i);
});

test("atalho de texto puro preserva parágrafos e quebras", () => {
  assert.equal(plainTextToEditorHtml("Um\nDois\n\nTrês"), "<p>Um<br>Dois</p><p>Três</p>");
  assert.equal(plainTextToEditorHtml("a < b & c"), "<p>a &lt; b &amp; c</p>");
});
