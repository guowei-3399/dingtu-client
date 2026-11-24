(function (root) {
  'use strict';

  const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  function base32Encode(bytes) {
    let bits = 0;
    let val = 0;
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
      val = (val << 8) | (bytes[i] & 0xff);
      bits += 8;
      while (bits >= 5) {
        out += BASE32[(val >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += BASE32[(val << (5 - bits)) & 31];
    return out;
  }

  function base32Decode(str) {
    const clean = String(str || '').toUpperCase().replace(/[\s=-]+/g, '');
    const out = [];
    let bits = 0;
    let val = 0;
    for (let i = 0; i < clean.length; i += 1) {
      const idx = BASE32.indexOf(clean[i]);
      if (idx < 0) continue;
      val = (val << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        out.push((val >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  }

  function decodeB64(str) {
    const norm = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = norm + '='.repeat((4 - (norm.length % 4)) % 4);
    const bin = atob(pad);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function encodeB64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function readVarint(bytes, pos) {
    let val = 0;
    let shift = 0;
    let i = pos;
    while (i < bytes.length) {
      const b = bytes[i++];
      val |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) return { val: val >>> 0, next: i };
      shift += 7;
      if (shift > 35) return null;
    }
    return null;
  }

  function writeVarint(out, n) {
    let v = n >>> 0;
    while (v >= 0x80) {
      out.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    out.push(v);
  }

  function writeLenBytes(out, fieldNo, bytes) {
    writeVarint(out, (fieldNo << 3) | 2);
    writeVarint(out, bytes.length);
    for (let i = 0; i < bytes.length; i += 1) out.push(bytes[i]);
  }

  function decodeOtpAuthMigration(uri) {
    const parsed = new URL(String(uri || '').trim());
    if (parsed.protocol !== 'otpauth-migration:') {
      throw new Error('不是有效的 otpauth-migration:// 迁移链接');
    }
    const dataParam = parsed.searchParams.get('data') || '';
    if (!dataParam) throw new Error('迁移链接缺少 data 参数');
    const bytes = decodeB64(dataParam);
    const decoder = new TextDecoder('utf-8');
    const results = [];

    let pos = 0;
    while (pos < bytes.length) {
      const tagRes = readVarint(bytes, pos);
      if (!tagRes) break;
      pos = tagRes.next;
      const field = tagRes.val >>> 3;
      const wire = tagRes.val & 7;
      if (wire === 0) {
        const vRes = readVarint(bytes, pos);
        if (!vRes) break;
        pos = vRes.next;
      } else if (wire === 2) {
        const lRes = readVarint(bytes, pos);
        if (!lRes) break;
        const end = lRes.next + lRes.val;
        const slice = bytes.subarray(lRes.next, end);
        pos = end;
        if (field === 1) {
          let p2 = 0;
          let secretBytes = null;
          let name = '';
          let issuer = '';
          let algoCode = 1;
          let digitsCode = 1;
          let otpType = 2;
          while (p2 < slice.length) {
            const t2 = readVarint(slice, p2);
            if (!t2) break;
            p2 = t2.next;
            const f2 = t2.val >>> 3;
            const w2 = t2.val & 7;
            if (w2 === 0) {
              const v2 = readVarint(slice, p2);
              if (!v2) break;
              p2 = v2.next;
              if (f2 === 4) algoCode = v2.val;
              else if (f2 === 5) digitsCode = v2.val;
              else if (f2 === 6) otpType = v2.val;
            } else if (w2 === 2) {
              const l2 = readVarint(slice, p2);
              if (!l2) break;
              const s2 = slice.subarray(l2.next, l2.next + l2.val);
              p2 = l2.next + l2.val;
              if (f2 === 1) secretBytes = s2;
              else if (f2 === 2) name = decoder.decode(s2);
              else if (f2 === 3) issuer = decoder.decode(s2);
            } else {
              break;
            }
          }
          if (secretBytes && secretBytes.length && otpType !== 1) {
            const secret = base32Encode(secretBytes);
            const algo = algoCode === 2 ? 'SHA256' : algoCode === 3 ? 'SHA512' : 'SHA1';
            const digits = digitsCode === 2 ? 8 : 6;
            const label = issuer && name && !name.startsWith(`${issuer}:`) ? `${issuer}:${name}` : (name || issuer || 'Account');
            const otpUri = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}${issuer ? `&issuer=${encodeURIComponent(issuer)}` : ''}&algorithm=${algo}&digits=${digits}&period=30`;
            results.push({ uri: otpUri, secret, name: name || issuer || 'Account', issuer, algorithm: algo, digits });
          }
        }
      } else {
        break;
      }
    }
    return results;
  }

  function encodeOtpAuthMigration(entries) {
    const encoder = new TextEncoder();
    const outer = [];
    for (const entry of (entries || [])) {
      const secretBytes = base32Decode(entry.secret || '');
      if (!secretBytes.length) continue;
      const inner = [];
      writeLenBytes(inner, 1, secretBytes);
      if (entry.name) writeLenBytes(inner, 2, encoder.encode(String(entry.name)));
      if (entry.issuer) writeLenBytes(inner, 3, encoder.encode(String(entry.issuer)));
      writeVarint(inner, (4 << 3) | 0);
      writeVarint(inner, entry.algorithm === 'SHA256' ? 2 : entry.algorithm === 'SHA512' ? 3 : 1);
      writeVarint(inner, (5 << 3) | 0);
      writeVarint(inner, Number(entry.digits) === 8 ? 2 : 1);
      writeVarint(inner, (6 << 3) | 0);
      writeVarint(inner, 2);
      writeLenBytes(outer, 1, new Uint8Array(inner));
    }
    writeVarint(outer, (2 << 3) | 0);
    writeVarint(outer, 1);
    writeVarint(outer, (3 << 3) | 0);
    writeVarint(outer, 1);
    writeVarint(outer, (4 << 3) | 0);
    writeVarint(outer, 0);
    return `otpauth-migration://offline?data=${encodeURIComponent(encodeB64(new Uint8Array(outer)))}`;
  }

  // GF(256) arithmetic (primitive polynomial 0x11d)
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  {
    let x = 1;
    for (let i = 0; i < 255; i += 1) {
      GF_EXP[i] = x;
      GF_EXP[i + 255] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
  }
  function gfMul(a, b) {
    return (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }
  function gfDiv(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[(GF_LOG[a] - GF_LOG[b] + 255) % 255];
  }
  function rsGenerator(ecCount) {
    let poly = [1];
    for (let i = 0; i < ecCount; i += 1) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = GF_EXP[i];
      for (let j = 0; j < poly.length; j += 1) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }
  function rsRemainder(data, ecCount) {
    const gen = rsGenerator(ecCount);
    const res = new Uint8Array(data.length + ecCount);
    res.set(data, 0);
    for (let i = 0; i < data.length; i += 1) {
      const coef = res[i];
      if (coef === 0) continue;
      for (let j = 1; j < gen.length; j += 1) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
    return res.subarray(data.length);
  }

  // RS decoder using syndromes + Berlekamp-Massey + Chien search + Forney
  function rsCorrectBlock(codeword, ecCount) {
    const n = codeword.length;
    const msg = Uint8Array.from(codeword);
    const syndromes = new Uint8Array(ecCount);
    let anyNonZero = false;
    for (let i = 0; i < ecCount; i += 1) {
      let s = 0;
      const evalX = GF_EXP[i];
      for (let j = 0; j < n; j += 1) {
        s = gfMul(s, evalX) ^ msg[j];
      }
      syndromes[i] = s;
      if (s !== 0) anyNonZero = true;
    }
    if (!anyNonZero) return msg;

    // Berlekamp-Massey for error locator polynomial C(x)
    let C = [1];
    let B = [1];
    let L = 0;
    let m = 1;
    let b = 1;
    for (let r = 0; r < ecCount; r += 1) {
      let d = syndromes[r];
      for (let i = 1; i <= L; i += 1) {
        d ^= gfMul(C[i] || 0, syndromes[r - i]);
      }
      if (d === 0) {
        m += 1;
      } else {
        const T = [...C];
        const coef = gfDiv(d, b);
        const paddedB = new Array(m).fill(0).concat(B);
        while (C.length < paddedB.length) C.push(0);
        for (let i = 0; i < paddedB.length; i += 1) {
          C[i] ^= gfMul(coef, paddedB[i]);
        }
        if (2 * L <= r) {
          L = r + 1 - L;
          B = T;
          b = d;
          m = 1;
        } else {
          m += 1;
        }
      }
    }

    if (L === 0 || L * 2 > ecCount) return null;

    // Chien search: find error positions where C(alpha^-pos) == 0
    const errPos = [];
    for (let pos = 0; pos < n; pos += 1) {
      const xiInv = GF_EXP[(255 - pos) % 255];
      let sum = 0;
      let pow = 1;
      for (let i = 0; i < C.length; i += 1) {
        sum ^= gfMul(C[i], pow);
        pow = gfMul(pow, xiInv);
      }
      if (sum === 0) errPos.push(pos);
    }
    if (errPos.length !== L) return null;

    // Omega(x) = S(x) * C(x) mod x^ecCount
    const omega = new Uint8Array(ecCount);
    for (let i = 0; i < ecCount; i += 1) {
      let acc = 0;
      for (let j = 0; j < C.length && j <= i; j += 1) {
        acc ^= gfMul(C[j], syndromes[i - j]);
      }
      omega[i] = acc;
    }

    // Forney algorithm: e_k = X_k * Omega(X_k^-1) / C'(X_k^-1) (since fcr=0 -> GF_EXP[0] root factor cancels!)
    for (const pos of errPos) {
      const xi = GF_EXP[pos];
      const xiInv = GF_EXP[(255 - pos) % 255];
      let num = 0;
      let pow = 1;
      for (let i = 0; i < ecCount; i += 1) {
        num ^= gfMul(omega[i], pow);
        pow = gfMul(pow, xiInv);
      }
      let denom = 0;
      let powEven = 1;
      for (let i = 1; i < C.length; i += 2) {
        denom ^= gfMul(C[i], powEven);
        powEven = gfMul(powEven, gfMul(xiInv, xiInv));
      }
      if (denom === 0) return null;
      const errMag = gfMul(xi, gfDiv(num, denom));
      msg[n - 1 - pos] ^= errMag;
    }

    // Verify clean syndromes after repair
    for (let i = 0; i < ecCount; i += 1) {
      let s = 0;
      const evalX = GF_EXP[i];
      for (let j = 0; j < n; j += 1) s = gfMul(s, evalX) ^ msg[j];
      if (s !== 0) return null;
    }
    return msg;
  }

  // ISO 18004 Versions 1..10 EC block specs: { total, ec: { [ecCode]: [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] } }
  // Format ecCode bits (bits 4..3 of unmasked 5-bit data): 1=L, 0=M, 3=Q, 2=H
  const ALIGN_CENTERS = [
    null,
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
  ];

  // Key: ecLevel (1=L, 0=M, 3=Q, 2=H) -> [ecPerBlock, b1, d1, b2, d2]
  const QR_BLOCKS = [
    null,
    { total: 26,  1: [7, 1, 19, 0, 0],  0: [10, 1, 16, 0, 0], 3: [13, 1, 13, 0, 0], 2: [17, 1, 9, 0, 0] },
    { total: 44,  1: [10, 1, 34, 0, 0], 0: [16, 1, 28, 0, 0], 3: [22, 1, 22, 0, 0], 2: [28, 1, 16, 0, 0] },
    { total: 70,  1: [15, 1, 55, 0, 0], 0: [26, 1, 44, 0, 0], 3: [18, 2, 17, 0, 0], 2: [22, 2, 13, 0, 0] },
    { total: 100, 1: [20, 1, 80, 0, 0], 0: [18, 2, 32, 0, 0], 3: [26, 2, 24, 0, 0], 2: [16, 4, 9, 0, 0] },
    { total: 134, 1: [26, 1, 108, 0, 0],0: [24, 2, 43, 0, 0], 3: [18, 2, 15, 2, 16],2: [22, 2, 11, 2, 12] },
    { total: 172, 1: [18, 2, 68, 0, 0], 0: [16, 4, 27, 0, 0], 3: [24, 4, 19, 0, 0], 2: [28, 4, 15, 0, 0] },
    { total: 196, 1: [20, 2, 78, 0, 0], 0: [18, 4, 31, 0, 0], 3: [18, 2, 14, 4, 15],2: [26, 4, 13, 1, 14] },
    { total: 242, 1: [24, 2, 97, 0, 0], 0: [22, 2, 38, 2, 39],3: [22, 4, 18, 2, 19],2: [26, 4, 14, 2, 15] },
    { total: 292, 1: [30, 2, 116, 0, 0],0: [22, 3, 36, 2, 37],3: [20, 4, 16, 4, 17],2: [24, 4, 12, 4, 13] },
    { total: 346, 1: [18, 2, 68, 2, 69],0: [26, 4, 43, 1, 44],3: [24, 6, 19, 2, 20],2: [28, 6, 15, 2, 16] },
  ];

  const MASK_PREDICATES = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => ((((r * c) % 2) + ((r * c) % 3)) % 2) === 0,
    (r, c) => ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0,
  ];

  // All 32 valid masked 15-bit format words (index 0..31 = 5-bit [ecLevel<<3 | mask])
  const FORMAT_WORDS = [];
  for (let data = 0; data < 32; data += 1) {
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    FORMAT_WORDS.push(((data << 10) | rem) ^ 0x5412);
  }

  function buildFunctionMask(ver) {
    const size = ver * 4 + 17;
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));
    const markFinder = (top, left) => {
      for (let dr = -1; dr <= 7; dr += 1) {
        for (let dc = -1; dc <= 7; dc += 1) {
          const r = top + dr;
          const c = left + dc;
          if (r >= 0 && r < size && c >= 0 && c < size) isFunc[r][c] = 1;
        }
      }
    };
    markFinder(0, 0);
    markFinder(0, size - 7);
    markFinder(size - 7, 0);
    for (let i = 8; i < size - 8; i += 1) {
      isFunc[6][i] = 1;
      isFunc[i][6] = 1;
    }
    const align = ALIGN_CENTERS[ver] || [];
    for (const rc of align) {
      for (const cc of align) {
        if ((rc === 6 && cc === 6) || (rc === 6 && cc === size - 7) || (rc === size - 7 && cc === 6)) continue;
        for (let dr = -2; dr <= 2; dr += 1) {
          for (let dc = -2; dc <= 2; dc += 1) isFunc[rc + dr][cc + dc] = 1;
        }
      }
    }
    isFunc[size - 8][8] = 1;
    for (let i = 0; i < 9; i += 1) {
      if (i !== 6) { isFunc[8][i] = 1; isFunc[i][8] = 1; }
    }
    for (let i = 0; i < 8; i += 1) {
      isFunc[8][size - 1 - i] = 1;
      if (i < 7) isFunc[size - 1 - i][8] = 1;
    }
    if (ver >= 7) {
      for (let i = 0; i < 18; i += 1) {
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        isFunc[a][b] = 1;
        isFunc[b][a] = 1;
      }
    }
    return isFunc;
  }

  function encodeQrMatrix(text) {
    const payload = new TextEncoder().encode(String(text || ''));
    let chosenVer = 0;
    for (let v = 1; v < QR_BLOCKS.length; v += 1) {
      const [/* ec */, b1, d1, b2, d2] = QR_BLOCKS[v][1];
      const dataCap = b1 * d1 + b2 * d2;
      const headerBits = 4 + (v >= 10 ? 16 : 8);
      if (headerBits + payload.length * 8 <= dataCap * 8) {
        chosenVer = v;
        break;
      }
    }
    if (!chosenVer) throw new Error('二维码内容过长（超过 271 字节，请减少单次导出的条数）');

    const [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] = QR_BLOCKS[chosenVer][1];
    const alignCenters = ALIGN_CENTERS[chosenVer];
    const totalDataBytes = g1Blocks * g1Data + g2Blocks * g2Data;
    const bits = [];
    const pushBits = (val, count) => {
      for (let i = count - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1);
    };
    pushBits(0b0100, 4);
    pushBits(payload.length, chosenVer >= 10 ? 16 : 8);
    for (let i = 0; i < payload.length; i += 1) pushBits(payload[i], 8);
    const maxDataBits = totalDataBytes * 8;
    const termBits = Math.min(4, maxDataBits - bits.length);
    for (let i = 0; i < termBits; i += 1) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);
    const dataBytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j += 1) b = (b << 1) | bits[i + j];
      dataBytes.push(b);
    }
    let padToggle = 0;
    while (dataBytes.length < totalDataBytes) {
      dataBytes.push(padToggle === 0 ? 0xec : 0x11);
      padToggle ^= 1;
    }

    const blocks = [];
    const eccBlocks = [];
    let offset = 0;
    for (let i = 0; i < g1Blocks; i += 1) {
      const blk = Uint8Array.from(dataBytes.slice(offset, offset + g1Data));
      offset += g1Data;
      blocks.push(blk);
      eccBlocks.push(rsRemainder(blk, ecPerBlock));
    }
    for (let i = 0; i < g2Blocks; i += 1) {
      const blk = Uint8Array.from(dataBytes.slice(offset, offset + g2Data));
      offset += g2Data;
      blocks.push(blk);
      eccBlocks.push(rsRemainder(blk, ecPerBlock));
    }

    const finalBytes = [];
    const maxDataLen = Math.max(g1Data, g2Data);
    for (let col = 0; col < maxDataLen; col += 1) {
      for (let b = 0; b < blocks.length; b += 1) {
        if (col < blocks[b].length) finalBytes.push(blocks[b][col]);
      }
    }
    for (let col = 0; col < ecPerBlock; col += 1) {
      for (let b = 0; b < eccBlocks.length; b += 1) finalBytes.push(eccBlocks[b][col]);
    }

    const size = chosenVer * 4 + 17;
    const modules = Array.from({ length: size }, () => new Int8Array(size));
    const isFunc = buildFunctionMask(chosenVer);
    const setFunc = (r, c, dark) => {
      modules[r][c] = dark ? 1 : 0;
    };

    const drawFinder = (top, left) => {
      for (let dr = -1; dr <= 7; dr += 1) {
        for (let dc = -1; dc <= 7; dc += 1) {
          const r = top + dr;
          const c = left + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const inBox = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          const border = inBox && (dr === 0 || dr === 6 || dc === 0 || dc === 6);
          const center = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          setFunc(r, c, border || center);
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    for (let i = 8; i < size - 8; i += 1) {
      setFunc(6, i, i % 2 === 0);
      setFunc(i, 6, i % 2 === 0);
    }
    for (const rCenter of alignCenters) {
      for (const cCenter of alignCenters) {
        if ((rCenter === 6 && cCenter === 6)
          || (rCenter === 6 && cCenter === size - 7)
          || (rCenter === size - 7 && cCenter === 6)) continue;
        for (let dr = -2; dr <= 2; dr += 1) {
          for (let dc = -2; dc <= 2; dc += 1) {
            setFunc(rCenter + dr, cCenter + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
          }
        }
      }
    }
    setFunc(size - 8, 8, true);

    if (chosenVer >= 7) {
      let rem = chosenVer;
      for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const verBits = (chosenVer << 12) | rem;
      for (let i = 0; i < 18; i += 1) {
        const bit = ((verBits >>> i) & 1) !== 0;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        setFunc(a, b, bit);
        setFunc(b, a, bit);
      }
    }

    let bitIdx = 0;
    const totalBits = finalBytes.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert += 1) {
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        for (let dx = 0; dx < 2; dx += 1) {
          const c = right - dx;
          if (!isFunc[r][c]) {
            let dark = false;
            if (bitIdx < totalBits) dark = ((finalBytes[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
            modules[r][c] = dark ? 1 : 0;
            bitIdx += 1;
          }
        }
      }
    }

    const writeFormat = (grid, maskIdx) => {
      const formatBits = FORMAT_WORDS[(1 << 3) | maskIdx];
      for (let i = 0; i <= 5; i += 1) grid[8][i] = (formatBits >>> i) & 1;
      grid[8][7] = (formatBits >>> 6) & 1;
      grid[8][8] = (formatBits >>> 7) & 1;
      grid[7][8] = (formatBits >>> 8) & 1;
      for (let i = 9; i < 15; i += 1) grid[14 - i][8] = (formatBits >>> i) & 1;
      for (let i = 0; i < 8; i += 1) grid[8][size - 1 - i] = (formatBits >>> i) & 1;
      for (let i = 8; i < 15; i += 1) grid[size - 15 + i][8] = (formatBits >>> i) & 1;
    };

    const scorePenalty = grid => {
      let penalty = 0;
      for (let r = 0; r < size; r += 1) {
        let runColor = grid[r][0], runLen = 1;
        for (let c = 1; c < size; c += 1) {
          if (grid[r][c] === runColor) runLen += 1;
          else { if (runLen >= 5) penalty += 3 + (runLen - 5); runColor = grid[r][c]; runLen = 1; }
        }
        if (runLen >= 5) penalty += 3 + (runLen - 5);
      }
      for (let c = 0; c < size; c += 1) {
        let runColor = grid[0][c], runLen = 1;
        for (let r = 1; r < size; r += 1) {
          if (grid[r][c] === runColor) runLen += 1;
          else { if (runLen >= 5) penalty += 3 + (runLen - 5); runColor = grid[r][c]; runLen = 1; }
        }
        if (runLen >= 5) penalty += 3 + (runLen - 5);
      }
      let darkCount = 0;
      for (let r = 0; r < size; r += 1) {
        for (let c = 0; c < size; c += 1) {
          if (grid[r][c]) darkCount += 1;
          if (r + 1 < size && c + 1 < size) {
            const s = grid[r][c] + grid[r + 1][c] + grid[r][c + 1] + grid[r + 1][c + 1];
            if (s === 0 || s === 4) penalty += 3;
          }
        }
      }
      penalty += Math.floor(Math.abs((darkCount * 100) / (size * size) - 50) / 5) * 10;
      return penalty;
    };

    let bestGrid = null;
    let bestScore = Infinity;
    for (let m = 0; m < 8; m += 1) {
      const candidate = modules.map((row, r) => {
        const copy = new Int8Array(row);
        for (let c = 0; c < size; c += 1) {
          if (!isFunc[r][c] && MASK_PREDICATES[m](r, c)) copy[c] ^= 1;
        }
        return copy;
      });
      writeFormat(candidate, m);
      const p = scorePenalty(candidate);
      if (p < bestScore) { bestScore = p; bestGrid = candidate; }
    }
    return { size, grid: bestGrid };
  }

  function decodeQrMatrix(grid) {
    const size = grid.length;
    const ver = Math.round((size - 17) / 4);
    if (ver < 1 || ver >= QR_BLOCKS.length || ver * 4 + 17 !== size) return null;

    let fmt1 = 0;
    for (let i = 0; i <= 5; i += 1) fmt1 |= (grid[8][i] & 1) << i;
    fmt1 |= (grid[8][7] & 1) << 6;
    fmt1 |= (grid[8][8] & 1) << 7;
    fmt1 |= (grid[7][8] & 1) << 8;
    for (let i = 9; i < 15; i += 1) fmt1 |= (grid[14 - i][8] & 1) << i;

    let fmt2 = 0;
    for (let i = 0; i < 8; i += 1) fmt2 |= (grid[8][size - 1 - i] & 1) << i;
    for (let i = 8; i < 15; i += 1) fmt2 |= (grid[size - 15 + i][8] & 1) << i;

    const popcount = x => {
      let c = 0;
      for (let v = x; v; v &= v - 1) c += 1;
      return c;
    };
    let bestFmt = -1;
    let bestDist = 4;
    for (let idx = 0; idx < FORMAT_WORDS.length; idx += 1) {
      const fw = FORMAT_WORDS[idx];
      const d = Math.min(popcount(fmt1 ^ fw), popcount(fmt2 ^ fw));
      if (d < bestDist) { bestDist = d; bestFmt = idx; }
    }
    if (bestFmt < 0) return null;

    const ecLevel = bestFmt >>> 3;
    const maskIdx = bestFmt & 7;
    const blockSpec = QR_BLOCKS[ver]?.[ecLevel];
    if (!blockSpec) return null;

    const isFunc = buildFunctionMask(ver);
    const maskFn = MASK_PREDICATES[maskIdx];
    const bytes = new Uint8Array(QR_BLOCKS[ver].total);
    let bytePos = 0;
    let curByte = 0;
    let bitCount = 0;

    for (let right = size - 1; right >= 1 && bytePos < bytes.length; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size && bytePos < bytes.length; vert += 1) {
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        for (let dx = 0; dx < 2 && bytePos < bytes.length; dx += 1) {
          const c = right - dx;
          if (!isFunc[r][c]) {
            const bit = (grid[r][c] & 1) ^ (maskFn(r, c) ? 1 : 0);
            curByte = (curByte << 1) | bit;
            bitCount += 1;
            if (bitCount === 8) {
              bytes[bytePos++] = curByte;
              curByte = 0;
              bitCount = 0;
            }
          }
        }
      }
    }

    const [ecPerBlock, b1, d1, b2, d2] = blockSpec;
    const totalBlocks = b1 + b2;
    const dataBlocks = [];
    for (let i = 0; i < b1; i += 1) dataBlocks.push(new Uint8Array(d1 + ecPerBlock));
    for (let i = 0; i < b2; i += 1) dataBlocks.push(new Uint8Array(d2 + ecPerBlock));

    let inPos = 0;
    const maxData = Math.max(d1, d2);
    for (let col = 0; col < maxData; col += 1) {
      for (let b = 0; b < totalBlocks; b += 1) {
        const dLen = b < b1 ? d1 : d2;
        if (col < dLen && inPos < bytes.length) dataBlocks[b][col] = bytes[inPos++];
      }
    }
    for (let col = 0; col < ecPerBlock; col += 1) {
      for (let b = 0; b < totalBlocks; b += 1) {
        const dLen = b < b1 ? d1 : d2;
        if (inPos < bytes.length) dataBlocks[b][dLen + col] = bytes[inPos++];
      }
    }

    const decodedBytes = [];
    for (let b = 0; b < totalBlocks; b += 1) {
      const dLen = b < b1 ? d1 : d2;
      const repaired = rsCorrectBlock(dataBlocks[b], ecPerBlock);
      if (!repaired) return null;
      for (let i = 0; i < dLen; i += 1) decodedBytes.push(repaired[i]);
    }

    // Read mode segments from decoded data stream
    let bitPtr = 0;
    const totalDataBits = decodedBytes.length * 8;
    const readBits = count => {
      if (bitPtr + count > totalDataBits) return null;
      let val = 0;
      for (let i = 0; i < count; i += 1) {
        const bit = (decodedBytes[bitPtr >>> 3] >>> (7 - (bitPtr & 7))) & 1;
        val = (val << 1) | bit;
        bitPtr += 1;
      }
      return val;
    };

    const outBytes = [];
    const ALPHANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
    while (bitPtr + 4 <= totalDataBits) {
      const mode = readBits(4);
      if (mode === null || mode === 0) break;
      if (mode === 7) { // ECI mode
        const b1Eci = readBits(8);
        if (b1Eci === null) break;
        if ((b1Eci & 0x80) === 0) continue;
        if ((b1Eci & 0xc0) === 0x80) { readBits(8); continue; }
        readBits(16);
        continue;
      }
      if (mode === 4) { // Byte mode
        const len = readBits(ver >= 10 ? 16 : 8);
        if (len === null || bitPtr + len * 8 > totalDataBits) return null;
        for (let i = 0; i < len; i += 1) outBytes.push(readBits(8));
      } else if (mode === 2) { // Alphanumeric
        const len = readBits(ver >= 10 ? 11 : 9);
        if (len === null) return null;
        let rem = len;
        while (rem >= 2) {
          const pair = readBits(11);
          if (pair === null) return null;
          const s = ALPHANUM[Math.floor(pair / 45)] + ALPHANUM[pair % 45];
          outBytes.push(s.charCodeAt(0), s.charCodeAt(1));
          rem -= 2;
        }
        if (rem === 1) {
          const ch = readBits(6);
          if (ch === null) return null;
          outBytes.push(ALPHANUM.charCodeAt(ch));
        }
      } else if (mode === 1) { // Numeric
        const len = readBits(ver >= 10 ? 12 : 10);
        if (len === null) return null;
        let rem = len;
        while (rem >= 3) {
          const g = readBits(10);
          if (g === null) return null;
          const s = String(g).padStart(3, '0');
          for (let k = 0; k < 3; k += 1) outBytes.push(s.charCodeAt(k));
          rem -= 3;
        }
        if (rem === 2) {
          const g = readBits(7);
          if (g === null) return null;
          const s = String(g).padStart(2, '0');
          outBytes.push(s.charCodeAt(0), s.charCodeAt(1));
        } else if (rem === 1) {
          const g = readBits(4);
          if (g === null) return null;
          outBytes.push(48 + g);
        }
      } else {
        return null;
      }
    }
    return new TextDecoder('utf-8').decode(new Uint8Array(outBytes));
  }

  function binarizeOtsu(gray, nPix) {
    const hist = new Int32Array(256);
    for (let i = 0; i < nPix; i += 1) hist[gray[i]] += 1;
    let sum = 0;
    for (let t = 0; t < 256; t += 1) sum += t * hist[t];
    let sumB = 0, wB = 0, maxVar = -1, thresh = 128;
    for (let t = 0; t < 256; t += 1) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = nPix - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > maxVar) { maxVar = v; thresh = t; }
    }
    const bin = new Uint8Array(nPix);
    for (let i = 0; i < nPix; i += 1) bin[i] = gray[i] <= thresh ? 1 : 0;
    return bin;
  }

  function checkRunRatio(counts) {
    const total = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
    if (total < 7) return false;
    const mod = total / 7;
    const tol = mod * 0.55;
    return Math.abs(counts[0] - mod) < tol
      && Math.abs(counts[1] - mod) < tol
      && Math.abs(counts[2] - 3 * mod) < 3 * tol
      && Math.abs(counts[3] - mod) < tol
      && Math.abs(counts[4] - mod) < tol;
  }

  function crossCheckFinder(bin, w, h, cy0, cx0) {
    const cY = Math.round(cy0);
    const cX = Math.round(cx0);
    if (cX < 0 || cX >= w || cY < 0 || cY >= h || !bin[cY * w + cX]) return null;
    const counts = [0, 0, 0, 0, 0];
    let r = cY;
    while (r >= 0 && bin[r * w + cX]) { counts[2] += 1; r -= 1; }
    if (r < 0) return null;
    while (r >= 0 && !bin[r * w + cX]) { counts[1] += 1; r -= 1; }
    if (r < 0) return null;
    while (r >= 0 && bin[r * w + cX]) { counts[0] += 1; r -= 1; }
    r = cY + 1;
    while (r < h && bin[r * w + cX]) { counts[2] += 1; r += 1; }
    if (r >= h) return null;
    while (r < h && !bin[r * w + cX]) { counts[3] += 1; r += 1; }
    if (r >= h) return null;
    while (r < h && bin[r * w + cX]) { counts[4] += 1; r += 1; }
    if (!checkRunRatio(counts)) return null;
    const vCenter = (r - counts[4] - counts[3] - counts[2] / 2);
    const totalV = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];

    // Refine X at refined vCenter
    const vy = Math.round(vCenter);
    if (vy < 0 || vy >= h || !bin[vy * w + cX]) return null;
    const hCounts = [0, 0, 0, 0, 0];
    let c = cX;
    while (c >= 0 && bin[vy * w + c]) { hCounts[2] += 1; c -= 1; }
    if (c < 0) return null;
    while (c >= 0 && !bin[vy * w + c]) { hCounts[1] += 1; c -= 1; }
    if (c < 0) return null;
    while (c >= 0 && bin[vy * w + c]) { hCounts[0] += 1; c -= 1; }
    c = cX + 1;
    while (c < w && bin[vy * w + c]) { hCounts[2] += 1; c += 1; }
    if (c >= w) return null;
    while (c < w && !bin[vy * w + c]) { hCounts[3] += 1; c += 1; }
    if (c >= w) return null;
    while (c < w && bin[vy * w + c]) { hCounts[4] += 1; c += 1; }
    if (!checkRunRatio(hCounts)) return null;
    const hCenter = c - hCounts[4] - hCounts[3] - hCounts[2] / 2;
    const totalH = hCounts[0] + hCounts[1] + hCounts[2] + hCounts[3] + hCounts[4];
    return { x: hCenter, y: vCenter, mod: (totalV + totalH) / 14 };
  }

  function locateFinders(bin, w, h) {
    const centers = [];
    const skip = Math.max(1, Math.floor(Math.min(w, h) / 260));
    for (let y = 0; y < h; y += skip) {
      const counts = [0, 0, 0, 0, 0];
      let state = 0;
      for (let x = 0; x < w; x += 1) {
        const dark = bin[y * w + x] === 1;
        if (dark) {
          if ((state & 1) === 1) state += 1;
          counts[state] += 1;
        } else {
          if ((state & 1) === 0) {
            if (state === 4) {
              if (checkRunRatio(counts)) {
                const estCx = x - counts[4] - counts[3] - counts[2] / 2;
                const hit = crossCheckFinder(bin, w, h, y, estCx);
                if (hit) {
                  let merged = false;
                  for (const cluster of centers) {
                    const d = Math.hypot(cluster.x - hit.x, cluster.y - hit.y);
                    if (d < Math.max(8, cluster.mod * 3)) {
                      const n = cluster.count;
                      cluster.x = (cluster.x * n + hit.x) / (n + 1);
                      cluster.y = (cluster.y * n + hit.y) / (n + 1);
                      cluster.mod = (cluster.mod * n + hit.mod) / (n + 1);
                      cluster.count += 1;
                      merged = true;
                      break;
                    }
                  }
                  if (!merged) centers.push({ x: hit.x, y: hit.y, mod: hit.mod, count: 1 });
                }
              }
              counts[0] = counts[2]; counts[1] = counts[3]; counts[2] = counts[4]; counts[3] = 1; counts[4] = 0;
              state = 3;
            } else {
              state += 1;
              counts[state] = 1;
            }
          } else {
            counts[state] += 1;
          }
        }
      }
    }
    centers.sort((a, b) => b.count - a.count);
    return centers;
  }

  function decodeBinaryGrid(bin, w, h) {
    const clusters = locateFinders(bin, w, h);
    if (clusters.length < 3) return null;
    const p0 = clusters[0], p1 = clusters[1], p2 = clusters[2];
    const d01 = Math.hypot(p0.x - p1.x, p0.y - p1.y);
    const d02 = Math.hypot(p0.x - p2.x, p0.y - p2.y);
    const d12 = Math.hypot(p1.x - p2.x, p1.y - p2.y);

    let tl, a, b;
    if (d12 >= d01 && d12 >= d02) { tl = p0; a = p1; b = p2; }
    else if (d02 >= d01 && d02 >= d12) { tl = p1; a = p0; b = p2; }
    else { tl = p2; a = p0; b = p1; }

    // Cross product (A - TL) x (B - TL) > 0 means A is TopRight, B is BottomLeft in image coords (x right, y down).
    const cross = (a.x - tl.x) * (b.y - tl.y) - (a.y - tl.y) * (b.x - tl.x);
    const tr = cross >= 0 ? a : b;
    const bl = cross >= 0 ? b : a;

    const avgMod = (tl.mod + tr.mod + bl.mod) / 3;
    const spanTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const spanLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const estSize = Math.round(((spanTop + spanLeft) / (2 * avgMod)) + 7);
    const baseVer = Math.max(1, Math.min(10, Math.round((estSize - 17) / 4)));

    for (const ver of [baseVer, baseVer - 1, baseVer + 1]) {
      if (ver < 1 || ver >= QR_BLOCKS.length) continue;
      const size = ver * 4 + 17;
      const grid = Array.from({ length: size }, (_, r) => {
        const row = new Int8Array(size);
        for (let c = 0; c < size; c += 1) {
          const u = (c - 3) / (size - 7);
          const v = (r - 3) / (size - 7);
          const px = Math.round(tl.x + u * (tr.x - tl.x) + v * (bl.x - tl.x));
          const py = Math.round(tl.y + u * (tr.y - tl.y) + v * (bl.y - tl.y));
          row[c] = (px >= 0 && px < w && py >= 0 && py < h) ? bin[py * w + px] : 0;
        }
        return row;
      });
      const text = decodeQrMatrix(grid);
      if (text) return text;
    }
    return null;
  }

  function decodeQrFromImageData(imageData) {
    if (!imageData || !imageData.width || !imageData.height || !imageData.data) return null;
    const w = imageData.width;
    const h = imageData.height;
    const rgba = imageData.data;
    const nPix = w * h;
    const gray = new Uint8Array(nPix);
    for (let i = 0; i < nPix; i += 1) {
      const idx = i * 4;
      const alpha = rgba[idx + 3] / 255;
      const r = rgba[idx] * alpha + 255 * (1 - alpha);
      const g = rgba[idx + 1] * alpha + 255 * (1 - alpha);
      const b = rgba[idx + 2] * alpha + 255 * (1 - alpha);
      gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    const bin = binarizeOtsu(gray, nPix);
    const direct = decodeBinaryGrid(bin, w, h);
    if (direct) return direct;

    // Fallback for dark-mode inverted QR screenshots
    const inv = new Uint8Array(nPix);
    for (let i = 0; i < nPix; i += 1) inv[i] = bin[i] ^ 1;
    return decodeBinaryGrid(inv, w, h);
  }

  function renderQrSvg(text, px = 220) {
    const opts = (px && typeof px === 'object') ? px : { px };
    const dim = Number(opts.px ?? opts.size) || 220;
    const margin = Number.isInteger(opts.margin) && opts.margin >= 0 ? opts.margin : 4;
    const { size, grid } = encodeQrMatrix(text);
    const full = size + margin * 2;
    let pathData = '';
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (grid[r][c]) pathData += `M${c + margin},${r + margin}h1v1h-1z`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" width="${dim}" height="${dim}" shape-rendering="crispEdges" role="img" aria-label="2FA 迁移二维码"><rect width="${full}" height="${full}" fill="#ffffff"/><path d="${pathData}" fill="#0f172a"/></svg>`;
  }

  async function scanQrFromImageFile(file) {
    if (!file) throw new Error('未选择图片文件');
    const bmp = await globalThis.createImageBitmap(file);
    try {
      if (typeof globalThis.BarcodeDetector === 'function') {
        try {
          const detector = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
          const codes = await detector.detect(bmp);
          const hit = Array.isArray(codes) ? codes.find(c => typeof c?.rawValue === 'string' && c.rawValue.trim()) : null;
          if (hit) return hit.rawValue.trim();
        } catch {}
      }
      if (typeof globalThis.document?.createElement === 'function') {
        const maxSide = 720;
        const scale = Math.min(1, maxSide / Math.max(bmp.width || 1, bmp.height || 1));
        const cw = Math.max(64, Math.round(bmp.width * scale));
        const ch = Math.max(64, Math.round(bmp.height * scale));
        const canvas = globalThis.document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(bmp, 0, 0, cw, ch);
        const imageData = ctx.getImageData(0, 0, cw, ch);
        const decoded = decodeQrFromImageData(imageData);
        if (decoded && decoded.trim()) return decoded.trim();
      }
      throw new Error('未在图片中识别到有效二维码，请确认截图清晰且包含完整的 2FA 二维码');
    } finally {
      bmp.close?.();
    }
  }

  root.DingtuTotpQr = Object.freeze({
    decodeOtpAuthMigration,
    encodeOtpAuthMigration,
    encodeQrMatrix,
    decodeQrMatrix,
    decodeQrFromImageData,
    renderQrSvg,
    scanQrFromImageFile,
  });
  if (typeof module === 'object' && module.exports) {
    module.exports = root.DingtuTotpQr;
  }
})(globalThis);
