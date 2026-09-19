/**
 * Canvas renderer for Xiaohongshu / sticker-style image frames.
 * Export uses native image resolution (1:1 pixels) unless outputWidth is set.
 */
(function (global) {
    const REF_WIDTH = 390;

    function roundRect(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
    }

    function hexToRgba(hex, alpha) {
        const raw = String(hex || '#f6edda').replace('#', '');
        const full = raw.length === 3
            ? raw.split('').map((c) => c + c).join('')
            : raw.padEnd(6, '0').slice(0, 6);
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function drawCoverImage(ctx, image, x, y, w, h) {
        const imgW = image.naturalWidth || image.width;
        const imgH = image.naturalHeight || image.height;
        if (!imgW || !imgH) return;
        const scale = Math.max(w / imgW, h / imgH);
        const sw = imgW * scale;
        const sh = imgH * scale;
        const sx = x + (w - sw) / 2;
        const sy = y + (h - sh) / 2;
        ctx.drawImage(image, sx, sy, sw, sh);
    }

    /** Blurred same-image background — blur on a small offscreen, then upscale (GPU-safe). */
    function drawBlurredImageBackground(ctx, image, x, y, w, h, opts, drawW) {
        const baseBlur = Number(opts.glassBlur) || 32;
        const maxSide = Math.max(w, h, 1);
        const isPreview = Number(opts.previewMaxWidth) > 0;
        const blurCanvasMax = isPreview ? 480 : 840;
        const shrink = Math.min(1, blurCanvasMax / maxSide);
        const offW = Math.max(1, Math.ceil(w * shrink));
        const offH = Math.max(1, Math.ceil(h * shrink));
        const blurPx = Math.min(
            56,
            Math.max(2, baseBlur * (Math.max(offW, drawW * shrink || offW) / REF_WIDTH))
        );
        const zoom = Math.max(1, Number(opts.glassZoom) || 1);

        const off = document.createElement('canvas');
        off.width = offW;
        off.height = offH;
        const octx = off.getContext('2d', { alpha: true });
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = 'high';
        octx.filter = `blur(${blurPx}px) saturate(${opts.glassSaturate ?? 1.08}) brightness(${opts.glassBrightness ?? 1.02})`;
        const pad = Math.ceil(blurPx * 2);
        const drawWZoom = offW * zoom;
        const drawHZoom = offH * zoom;
        drawCoverImage(
            octx,
            image,
            (offW - drawWZoom) / 2 - pad,
            (offH - drawHZoom) / 2 - pad,
            drawWZoom + pad * 2,
            drawHZoom + pad * 2
        );
        octx.filter = 'none';

        const frostRaw = Number(opts.glassFrost);
        const frost = Number.isFinite(frostRaw) ? frostRaw : 0.05;
        const tintAlpha = Number(opts.glassTint) || 0;
        const radius = Number(opts.borderRadius) || 14;

        ctx.save();
        roundRect(ctx, x, y, w, h, radius);
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(off, x, y, w, h);
        // 半透明玻璃罩：白雾强度由 glassFrost 控制（破框默认约 0.3），不是厚磨砂亚克力
        if (frost > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${frost})`;
            ctx.fillRect(x, y, w, h);
        }
        // 顶部高光，模拟玻璃反光
        const sheen = Number(opts.glassSheen);
        const sheenAlpha = Number.isFinite(sheen) ? sheen : 0.1;
        if (sheenAlpha > 0) {
            const gloss = ctx.createLinearGradient(x, y, x, y + h * 0.45);
            gloss.addColorStop(0, `rgba(255, 255, 255, ${sheenAlpha})`);
            gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = gloss;
            ctx.fillRect(x, y, w, h);
        }
        if (tintAlpha > 0 && opts.bgColor) {
            ctx.fillStyle = hexToRgba(opts.bgColor, tintAlpha);
            ctx.fillRect(x, y, w, h);
        }
        ctx.restore();
    }

    function fillSolidBackground(ctx, x, y, w, h, color, radius = 14) {
        ctx.fillStyle = color;
        roundRect(ctx, x, y, w, h, radius);
        ctx.fill();
    }

    function roundRectSketch(ctx, x, y, w, h) {
        const s = Math.min(w, h) * 0.045;
        const tl = s * 2.8;
        const tr = s * 0.75;
        const br = s * 2.4;
        const bl = s * 0.85;
        ctx.beginPath();
        ctx.moveTo(x + tl, y);
        ctx.lineTo(x + w - tr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
        ctx.lineTo(x + w, y + h - br);
        ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
        ctx.lineTo(x + bl, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
        ctx.lineTo(x, y + tl);
        ctx.quadraticCurveTo(x, y, x + tl, y);
        ctx.closePath();
    }

    function clipFramePath(ctx, x, y, w, h, radius, borderStyle) {
        if (borderStyle === 'sketch') roundRectSketch(ctx, x, y, w, h);
        else roundRect(ctx, x, y, w, h, radius);
    }

    function strokeFramePath(ctx, x, y, w, h, radius, borderStyle) {
        clipFramePath(ctx, x, y, w, h, radius, borderStyle);
        ctx.stroke();
    }

    function drawGradientFill(ctx, x, y, w, h, colors, radius = 14) {
        ctx.save();
        roundRect(ctx, x, y, w, h, radius);
        ctx.clip();
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, colors[0]);
        g.addColorStop(1, colors[1] || colors[0]);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
    }

    function drawCardBackground(ctx, image, x, y, w, h, opts, drawW) {
        const radius = 14;
        const useGlass = opts.glassBg !== false && opts.bgMode !== 'solid';
        if (useGlass) {
            drawBlurredImageBackground(ctx, image, x, y, w, h, opts, drawW);
            if (opts.bgOverlay) {
                ctx.save();
                roundRect(ctx, x, y, w, h, radius);
                ctx.clip();
                ctx.fillStyle = opts.bgOverlay;
                ctx.fillRect(x, y, w, h);
                ctx.restore();
            }
            return;
        }
        if (opts.bgMode === 'gradient' && opts.bgGradient) {
            drawGradientFill(ctx, x, y, w, h, opts.bgGradient, radius);
            return;
        }
        fillSolidBackground(ctx, x, y, w, h, opts.bgColor || '#f6edda', radius);
    }

    function drawImageShadow(ctx, imgX, imgY, drawW, drawH, borderRadius, opts) {
        const mode = opts.shadowMode || 'hard';
        const offset = opts.shadowOffset || 0;
        const alpha = opts.shadowAlpha ?? 0.45;
        if (offset <= 0 && mode !== 'glow') return;

        if (mode === 'glow' && opts.glowColor) {
            ctx.save();
            ctx.shadowColor = opts.glowColor;
            ctx.shadowBlur = offset * 4;
            ctx.fillStyle = 'rgba(0,0,0,0.01)';
            roundRect(ctx, imgX, imgY, drawW, drawH, borderRadius);
            ctx.fill();
            ctx.restore();
            return;
        }

        if (mode === 'soft') {
            ctx.save();
            ctx.shadowColor = `rgba(0,0,0,${alpha})`;
            ctx.shadowBlur = offset * 3;
            ctx.shadowOffsetY = offset;
            ctx.fillStyle = 'rgba(0,0,0,0.01)';
            roundRect(ctx, imgX, imgY, drawW, drawH, borderRadius);
            ctx.fill();
            ctx.restore();
            return;
        }

        ctx.fillStyle = `rgba(38, 34, 28, ${alpha})`;
        roundRect(ctx, imgX + offset, imgY + offset, drawW, drawH, borderRadius);
        ctx.fill();
    }

    /**
     * 抠图角色绘制：可缩放（默认底部锚定，方便凳脚/裙摆贴框底）+ 可选边缘阴影（景深感）
     */
    function resolveSubjectDrawRect(imgX, imgY, drawW, drawH, opts) {
        const raw = Number(opts.popOutSubjectScale ?? opts.subjectScale);
        const scale = Number.isFinite(raw) ? Math.min(1.8, Math.max(0.5, raw)) : 1;
        const w = drawW * scale;
        const h = drawH * scale;
        const x = imgX + (drawW - w) / 2;
        const anchor = String(opts.subjectAnchor || 'bottom');
        let y;
        if (anchor === 'center') {
            y = imgY + (drawH - h) / 2;
        } else if (anchor === 'top') {
            y = imgY;
        } else {
            // bottom：放大时向下伸，更容易跟黑框下边对齐
            y = imgY + drawH - h;
        }
        return { x, y, w, h, scale };
    }

    function drawMatteLayer(ctx, matteFg, imgX, imgY, drawW, drawH, opts) {
        const fgW = matteFg.naturalWidth || matteFg.width;
        const fgH = matteFg.naturalHeight || matteFg.height;
        if (!fgW || !fgH) return;
        const rect = resolveSubjectDrawRect(imgX, imgY, drawW, drawH, opts);
        const shadowBlurRaw = Number(opts.subjectShadowBlur);
        const blur = Number.isFinite(shadowBlurRaw)
            ? Math.max(0, shadowBlurRaw)
            : (opts.subjectShadow === false ? 0 : 16);

        ctx.save();
        if (blur > 0) {
            ctx.shadowColor = opts.subjectShadowColor || 'rgba(0, 0, 0, 0.42)';
            ctx.shadowBlur = blur;
            ctx.shadowOffsetX = Number(opts.subjectShadowOffsetX) || 0;
            ctx.shadowOffsetY = Number.isFinite(Number(opts.subjectShadowOffsetY))
                ? Number(opts.subjectShadowOffsetY)
                : Math.max(2, Math.round(blur * 0.28));
        }
        ctx.drawImage(matteFg, 0, 0, fgW, fgH, rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
    }

    /**
     * 景深最底层：只保留磨砂原图，去掉横/竖黑边杂项。
     */
    function drawFrostPlate(ctx, image, x, y, w, h, opts, drawW, radius) {
        const frostRaw = Number(opts.popOutBgOpacity);
        const frost = Number.isFinite(frostRaw) ? Math.min(0.7, Math.max(0, frostRaw)) : 0.22;
        drawBlurredImageBackground(ctx, image, x, y, w, h, {
            ...opts,
            borderRadius: radius || 0,
            glassBlur: Number(opts.popOutOuterBlur) || 18,
            glassFrost: frost,
            glassSheen: 0.04,
            glassZoom: 1.03,
            glassBrightness: 1.0,
            glassSaturate: 1.02,
            glassTint: 0
        }, drawW);
    }

    /**
     * 景深探出（正确模型）：
     * - 卡片 = 可缩小的空心描边框（框内透明，透出磨砂背景）
     * - 角色 = 独立抠图层，绝不 clip，放大后自然探出卡片
     * 不再需要单独的「破框」模式，也不再内套第二层空心黑框。
     */
    function drawDofCardAndSubject(
        ctx,
        matteFg,
        imgX,
        imgY,
        drawW,
        drawH,
        borderRadius,
        borderWidth,
        borderColor,
        opts
    ) {
        const cardScaleRaw = Number(opts.popOutFrameScale);
        const cardScale = Number.isFinite(cardScaleRaw)
            ? Math.min(0.98, Math.max(0.35, cardScaleRaw))
            : 0.72;
        const cardW = drawW * cardScale;
        const cardH = drawH * cardScale;
        const freeX = Math.max(0, drawW - cardW);
        const freeY = Math.max(0, drawH - cardH);
        const offsetY = Number(opts.popOutFrameOffsetY);
        const offsetNorm = Number.isFinite(offsetY) ? Math.max(-1, Math.min(1, offsetY)) : -0.2;
        const cardX = imgX + freeX / 2;
        const cardY = imgY + freeY * (0.5 + offsetNorm * 0.5);
        const radius = Math.max(4, Math.round((Number(borderRadius) || 14) * Math.min(1, cardScale + 0.15)));
        const strokeW = Math.max(2.5, Number(borderWidth) || 3);

        // 空心卡片：只用干净圆角描边，避免手绘边框在拐角花掉
        ctx.save();
        ctx.strokeStyle = borderColor || '#1a1814';
        ctx.lineWidth = strokeW;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        roundRect(ctx, cardX + strokeW / 2, cardY + strokeW / 2, Math.max(1, cardW - strokeW), Math.max(1, cardH - strokeW), Math.max(2, radius - strokeW / 2));
        ctx.stroke();
        ctx.restore();

        // 角色在最上：可探出卡片（不 clip）
        drawMatteLayer(ctx, matteFg, imgX, imgY, drawW, drawH, opts);
    }

    function drawDofInsideFrame(ctx, image, matteFg, imgX, imgY, drawW, drawH, opts) {
        // 兼容旧调用：改为同一套「卡片 + 探出」
        drawFrostPlate(ctx, image, imgX, imgY, drawW, drawH, opts, drawW, opts.borderRadius || 14);
        drawDofCardAndSubject(
            ctx,
            matteFg,
            imgX,
            imgY,
            drawW,
            drawH,
            opts.borderRadius || 14,
            opts.borderWidth || 3,
            opts.borderColor || '#1a1814',
            opts
        );
    }

    function drawTape(ctx, x, y, w, h, variant) {
        ctx.save();
        ctx.globalAlpha = variant === 'warm' ? 0.32 : 0.28;
        const colors = {
            warm: '#e8503a',
            blue: 'rgba(47,124,214,0.55)',
            yellow: 'rgba(255,235,150,0.55)',
            default: 'rgba(255, 248, 220, 0.95)'
        };
        ctx.fillStyle = colors[variant] || colors.default;
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(-0.12);
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
    }

    function wrapLines(ctx, text, maxWidth) {
        const raw = String(text || '').trim();
        if (!raw) return [];
        const lines = [];
        let line = '';
        for (const ch of raw) {
            const test = line + ch;
            if (ctx.measureText(test).width > maxWidth && line) {
                lines.push(line);
                line = ch;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
        return lines;
    }

    const BUBBLE_FONT = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

    const BUBBLE_DEFAULTS = {
        text: '在这里输入台词',
        fontSize: 18,
        maxWidthRatio: 0.42,
        shape: 'ellipse',
        tail: 'bottom',
        textColor: '#1f1b16',
        fillColor: '#ffffff',
        strokeColor: '#26221c'
    };

    /** 中英混排分词：连续 ASCII 单词不拆开，中文逐字；\n 强制换行 */
    function tokenizeForWrap(text) {
        const tokens = [];
        let buf = '';
        for (const ch of String(text || '')) {
            if (/[A-Za-z0-9'’\-]/.test(ch)) {
                buf += ch;
                continue;
            }
            if (buf) {
                tokens.push(buf);
                buf = '';
            }
            tokens.push(ch);
        }
        if (buf) tokens.push(buf);
        return tokens;
    }

    function wrapTokens(ctx, tokens, maxWidth) {
        const lines = [];
        let line = '';
        for (const tk of tokens) {
            if (tk === '\n') {
                lines.push(line);
                line = '';
                continue;
            }
            const test = line + tk;
            if (ctx.measureText(test).width > maxWidth && line) {
                lines.push(line);
                line = tk === ' ' ? '' : tk;
            } else {
                line = test;
            }
        }
        lines.push(line);
        return lines.map((l) => l.replace(/\s+$/, ''));
    }

    // 椭圆半轴系数：水平 1.274 / 垂直 1.61，保证最长那行文字也不会被椭圆切掉
    const ELLIPSE_KX = 1.274;
    const ELLIPSE_KY = 1.61;

    function measureBubble(ctx, bubble, drawW, uiScale) {
        const fontSize = scaledUi(Number(bubble.fontSize) || BUBBLE_DEFAULTS.fontSize, uiScale, 10);
        const shape = bubble.shape === 'rect' ? 'rect' : 'ellipse';
        ctx.font = `600 ${fontSize}px ${BUBBLE_FONT}`;
        const ratio = Number(bubble.maxWidthRatio) || BUBBLE_DEFAULTS.maxWidthRatio;
        const targetW = Math.max(60, drawW * ratio);
        const padX = fontSize * 0.62;
        const padY = fontSize * 0.5;
        const margin = fontSize * 0.35;
        // 反推文字可用宽度，使气泡整体宽度不超过 targetW
        const maxTextW = shape === 'ellipse'
            ? Math.max(fontSize * 1.6, targetW / ELLIPSE_KX - margin * 2)
            : Math.max(fontSize * 1.6, targetW - padX * 2);
        const lines = wrapTokens(ctx, tokenizeForWrap(bubble.text), maxTextW);
        const visible = lines.filter((l) => l.length);
        const lineH = fontSize * 1.38;
        let textW = 0;
        for (const line of visible) textW = Math.max(textW, ctx.measureText(line).width);
        return { fontSize, lines, visible, lineH, textW, padX, padY, margin, shape };
    }

    function bubbleShapeMetrics(m) {
        if (m.shape === 'rect') {
            const w = Math.max(m.fontSize * 2.4, m.textW + m.padX * 2);
            const h = Math.max(m.fontSize * 1.9, m.visible.length * m.lineH + m.padY * 2);
            return {
                shape: 'rect',
                w,
                h,
                halfW: w / 2,
                halfH: h / 2,
                radius: Math.min(w, h) * 0.32
            };
        }
        const rx = Math.max(m.fontSize * 1.2, ELLIPSE_KX * (m.textW / 2 + m.margin));
        const ry = Math.max(m.fontSize * 0.95, ELLIPSE_KY * ((m.visible.length * m.lineH) / 2 + m.margin));
        return { shape: 'ellipse', w: rx * 2, h: ry * 2, halfW: rx, halfH: ry, radius: 0 };
    }

    function tailTriangle(cx, cy, halfW, halfH, dir, tailLen, tailHalf) {
        const ol = Math.min(halfW, halfH) * 0.2;
        const skew = halfW * 0.12;
        if (dir === 'top') {
            return [[cx - tailHalf, cy - halfH + ol], [cx + tailHalf, cy - halfH + ol], [cx + skew, cy - halfH - tailLen]];
        }
        if (dir === 'left') {
            return [[cx - halfW + ol, cy - tailHalf], [cx - halfW + ol, cy + tailHalf], [cx - halfW - tailLen, cy + skew]];
        }
        if (dir === 'right') {
            return [[cx + halfW - ol, cy - tailHalf], [cx + halfW - ol, cy + tailHalf], [cx + halfW + tailLen, cy + skew]];
        }
        return [[cx - tailHalf, cy + halfH - ol], [cx + tailHalf, cy + halfH - ol], [cx + skew, cy + halfH + tailLen]];
    }

    /**
     * 三角子路径的绕向要和主体一致。left / right 尾巴的点序与 ellipse 相反，
     * 而 nonzero 填充规则下反向重叠区会被当成「洞」挖空，主体和尾巴的接缝处会透出底色。
     */
    function orientTriangle(tri) {
        let area = 0;
        for (let i = 0; i < tri.length; i += 1) {
            const [x1, y1] = tri[i];
            const [x2, y2] = tri[(i + 1) % tri.length];
            area += x1 * y2 - x2 * y1;
        }
        return area < 0 ? [tri[0], tri[2], tri[1]] : tri;
    }

    /**
     * 主体 + 尾巴合成一条路径（椭圆的绕向为正，三角已归一化）。
     *
     * 描边的做法：用双倍线宽沿这条并集轮廓描一次，再补一次填充把落在并集
     * 内部的半条描边抹掉。这样「椭圆底弧横穿尾巴内部」那条线自然消失，
     * 尾巴根部与主体的交界只剩一条连续外轮廓，不会出现交叉或台阶。
     */
    function bubbleOutlinePath(ctx, cx, cy, g, tailDir, tailLen, tailHalf) {
        ctx.beginPath();
        if (g.shape === 'ellipse') {
            ctx.ellipse(cx, cy, g.halfW, g.halfH, 0, 0, Math.PI * 2);
        } else {
            const r = Math.min(g.radius, g.halfW, g.halfH);
            const x = cx - g.halfW;
            const y = cy - g.halfH;
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + g.w, y, x + g.w, y + g.h, r);
            ctx.arcTo(x + g.w, y + g.h, x, y + g.h, r);
            ctx.arcTo(x, y + g.h, x, y, r);
            ctx.arcTo(x, y, x + g.w, y, r);
            ctx.closePath();
        }
        if (tailDir) {
            const tri = orientTriangle(tailTriangle(cx, cy, g.halfW, g.halfH, tailDir, tailLen, tailHalf));
            ctx.moveTo(tri[0][0], tri[0][1]);
            ctx.lineTo(tri[1][0], tri[1][1]);
            ctx.lineTo(tri[2][0], tri[2][1]);
            ctx.closePath();
        }
    }

    /**
     * 线段（起点在椭圆内、终点在外）与椭圆边界的交点，
     * 顺带给出交点对应的椭圆参数角，可以直接喂给 ctx.ellipse 画弧。
     */
    function ellipseBoundaryHit(cx, cy, rx, ry, x1, y1, x2, y2) {
        const dx = (x2 - x1) / rx;
        const dy = (y2 - y1) / ry;
        const ux = (x1 - cx) / rx;
        const uy = (y1 - cy) / ry;
        const a = dx * dx + dy * dy;
        if (a < 1e-9) return null;
        const b = 2 * (ux * dx + uy * dy);
        const c = ux * ux + uy * uy - 1;
        const disc = b * b - 4 * a * c;
        if (disc < 0) return null;
        const sq = Math.sqrt(disc);
        const t = [(-b - sq) / (2 * a), (-b + sq) / (2 * a)].find((v) => v > 1e-6 && v < 1);
        if (t === undefined) return null;
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;
        return { x: px, y: py, theta: Math.atan2((py - cy) / ry, (px - cx) / rx) };
    }

    /**
     * 椭圆 + 尾巴的并集轮廓：从一条斜边穿出椭圆的点出发，沿「不经过尾巴的那段长弧」
     * 绕到另一条斜边的穿出点，再折向尾巴尖。描边中心线因此正好压在真实边界上，
     * 根部既不会被椭圆底弧横穿，也不会向外鼓出一个假肩。
     * 求不到交点时返回 false，交回通用路径。
     */
    function buildEllipseUnionPath(ctx, cx, cy, g, tri, cornerR) {
        const rx = g.halfW;
        const ry = g.halfH;
        const tip = tri[2];
        const hitA = ellipseBoundaryHit(cx, cy, rx, ry, tri[0][0], tri[0][1], tip[0], tip[1]);
        const hitB = ellipseBoundaryHit(cx, cy, rx, ry, tri[1][0], tri[1][1], tip[0], tip[1]);
        if (!hitA || !hitB) return false;

        const TAU = Math.PI * 2;
        const fwd = (((hitB.theta - hitA.theta) % TAU) + TAU) % TAU;
        const dir = fwd >= Math.PI ? 1 : -1;

        // 弧线在这个角度上与尾边方向差的比较多，硬接会留一个「肩」，
        // 所以两个交点各让出一小段，用二次曲线过渡，尖端仍保持锐角。
        const legA = Math.hypot(tip[0] - hitA.x, tip[1] - hitA.y);
        const legB = Math.hypot(tip[0] - hitB.x, tip[1] - hitB.y);
        const d = Math.min(cornerR, legA * 0.3, legB * 0.3);
        const dTheta = Math.min(0.14, d / ((rx + ry) / 2));

        const thA2 = hitA.theta + dir * dTheta;
        const thB2 = hitB.theta - dir * dTheta;
        const pA2 = [cx + rx * Math.cos(thA2), cy + ry * Math.sin(thA2)];
        const pB2 = [cx + rx * Math.cos(thB2), cy + ry * Math.sin(thB2)];
        const pA3 = [hitA.x + ((tip[0] - hitA.x) / legA) * d, hitA.y + ((tip[1] - hitA.y) / legA) * d];
        const pB3 = [hitB.x + ((tip[0] - hitB.x) / legB) * d, hitB.y + ((tip[1] - hitB.y) / legB) * d];
        const fwd2 = (((thB2 - thA2) % TAU) + TAU) % TAU;

        ctx.beginPath();
        ctx.moveTo(pA3[0], pA3[1]);
        ctx.quadraticCurveTo(hitA.x, hitA.y, pA2[0], pA2[1]);
        if (dir > 0) {
            ctx.ellipse(cx, cy, rx, ry, 0, thA2, thA2 + fwd2, false);
        } else {
            ctx.ellipse(cx, cy, rx, ry, 0, thA2, thA2 + fwd2 - TAU, true);
        }
        ctx.quadraticCurveTo(hitB.x, hitB.y, pB3[0], pB3[1]);
        ctx.lineTo(tip[0], tip[1]);
        ctx.closePath();
        return true;
    }

    function drawBubble(ctx, bubble, cx, cy, drawW, uiScale) {
        const m = measureBubble(ctx, bubble, drawW, uiScale);
        if (!m.visible.length) return null;
        const g = bubbleShapeMetrics(m);
        const shape = g.shape;
        const strokeW = Math.max(1.5, m.fontSize * 0.13);
        const tailDir = bubble.tail && bubble.tail !== 'none' ? bubble.tail : null;
        const tailLen = Math.min(g.halfW, g.halfH) * 0.62;
        const tailHalf = Math.min(g.halfW, g.halfH) * 0.3;
        const fill = bubble.fillColor || BUBBLE_DEFAULTS.fillColor;
        const stroke = bubble.strokeColor || BUBBLE_DEFAULTS.strokeColor;

        // 椭圆 + 尾巴能拼出精确的并集轮廓，描边就压在真实边界上；
        // 圆角方框的边界是四段直线 + 四段圆角，拼轮廓要分四种朝向各写一遍，
        // 这里退回「双倍线宽描边 + 补填抹掉内半」的通用做法，代价只是交接处略微外鼓。
        const outlinePath = () => {
            if (tailDir && shape === 'ellipse') {
                const tri = tailTriangle(cx, cy, g.halfW, g.halfH, tailDir, tailLen, tailHalf);
                if (buildEllipseUnionPath(ctx, cx, cy, g, tri, strokeW * 0.7)) return true;
            }
            bubbleOutlinePath(ctx, cx, cy, g, tailDir, tailLen, tailHalf);
            return false;
        };

        ctx.save();
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 8;
        ctx.lineCap = 'round';

        // 1) 白底 + 投影：主体与尾巴按同一条轮廓填充，根部不会有缝
        ctx.save();
        ctx.shadowColor = 'rgba(20, 16, 10, 0.28)';
        ctx.shadowBlur = Math.max(4, m.fontSize * 0.7);
        ctx.shadowOffsetY = Math.max(2, m.fontSize * 0.18);
        ctx.fillStyle = fill;
        const exactUnion = outlinePath();
        ctx.fill();
        ctx.restore();

        // 2) 描边：精确轮廓用正常线宽；通用路径用双倍线宽，一半会压在形状内部
        ctx.strokeStyle = stroke;
        ctx.lineWidth = exactUnion ? strokeW : strokeW * 2;
        outlinePath();
        ctx.stroke();

        // 3) 通用路径再填一次，抹掉落在并集内部的那半描边
        //    —— 椭圆横穿尾巴的那段、三角顶边都在这一步消失
        if (!exactUnion) {
            ctx.fillStyle = fill;
            outlinePath();
            ctx.fill();
        }

        ctx.fillStyle = bubble.textColor || BUBBLE_DEFAULTS.textColor;
        ctx.font = `600 ${m.fontSize}px ${BUBBLE_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let y = cy - (m.visible.length * m.lineH) / 2 + m.lineH / 2;
        for (const line of m.visible) {
            ctx.fillText(line, cx, y);
            y += m.lineH;
        }
        ctx.restore();

        return { cx, cy, w: g.w, h: g.h };
    }

    /**
     * 气泡坐标用「相对图片内容区」的归一化值（x/y ∈ [0,1]）存储，
     * 因此预览（缩放过）和导出（原分辨率）落点完全一致。
     */
    function drawBubbles(ctx, bubbles, imgX, imgY, drawW, drawH, uiScale) {
        if (!Array.isArray(bubbles) || !bubbles.length || !drawW || !drawH) return;
        for (const bubble of bubbles) {
            const nx = Math.min(0.98, Math.max(0.02, Number(bubble.x) || 0));
            const ny = Math.min(0.98, Math.max(0.02, Number(bubble.y) || 0));
            drawBubble(ctx, bubble, imgX + nx * drawW, imgY + ny * drawH, drawW, uiScale);
        }
    }

    function resolveImageRect(image, options) {
        const measured = measureFrame(image, options);
        const opts = measured.opts || {};
        if (opts.plain || opts.preset === 'none') {
            return {
                imgX: 0,
                imgY: 0,
                drawW: measured.drawW,
                drawH: measured.drawH,
                uiScale: measured.uiScale || 1
            };
        }
        return {
            imgX: (measured.padding || 0) + (measured.popPadSides || 0),
            imgY: (measured.padding || 0) + (measured.popPadTop || 0),
            drawW: measured.drawW,
            drawH: measured.drawH,
            uiScale: measured.uiScale || 1
        };
    }

    function bubbleBoxAt(ctx, bubble, layout) {
        const m = measureBubble(ctx, bubble, layout.drawW, layout.uiScale);
        if (!m.visible.length) return null;
        const g = bubbleShapeMetrics(m);
        return {
            cx: layout.imgX + (Number(bubble.x) || 0) * layout.drawW,
            cy: layout.imgY + (Number(bubble.y) || 0) * layout.drawH,
            w: g.w,
            h: g.h
        };
    }

    /** 从上层往下命中，返回气泡下标，未命中返回 -1 */
    function hitTestBubble(ctx, bubbles, px, py, layout) {
        if (!Array.isArray(bubbles)) return -1;
        for (let i = bubbles.length - 1; i >= 0; i -= 1) {
            const box = bubbleBoxAt(ctx, bubbles[i], layout);
            if (!box) continue;
            if (Math.abs(px - box.cx) <= box.w / 2 && Math.abs(py - box.cy) <= box.h / 2) return i;
        }
        return -1;
    }

    function resolveDrawSize(image, opts) {
        const imgW = image.naturalWidth || image.width;
        const imgH = image.naturalHeight || image.height;
        if (!imgW || !imgH) {
            return { imgW: 0, imgH: 0, drawW: 0, drawH: 0, uiScale: 1 };
        }

        const padding = Number(opts.padding) || 24;
        const outputWidth = Number(opts.outputWidth);
        const previewMaxWidth = Number(opts.previewMaxWidth) || 0;

        let targetContentW;
        if (previewMaxWidth > 0) {
            targetContentW = Math.max(1, previewMaxWidth - padding * 2);
        } else if (outputWidth > 0) {
            targetContentW = Math.max(1, outputWidth - padding * 2);
        } else {
            return { imgW, imgH, drawW: imgW, drawH: imgH, uiScale: imgW / REF_WIDTH };
        }

        const scale = targetContentW / imgW;
        return {
            imgW,
            imgH,
            drawW: Math.max(1, Math.round(imgW * scale)),
            drawH: Math.max(1, Math.round(imgH * scale)),
            uiScale: targetContentW / REF_WIDTH
        };
    }

    const PRESET_ALIASES = { xhs: 'paper-collage', plain: 'none', raw: 'none' };

    const PRESETS = {
        none: {
            label: '无边框 · 原图',
            padding: 0,
            bgColor: '#000000',
            bgMode: 'solid',
            glassBg: false,
            borderWidth: 0,
            borderColor: 'transparent',
            borderRadius: 0,
            shadowMode: 'hard',
            shadowOffset: 0,
            shadowAlpha: 0,
            tiltDeg: 0,
            tape: false,
            captionFontSize: 14,
            outputWidth: 0,
            plain: true
        },
        'paper-collage': {
            label: '贴纸剪贴 · paper-collage',
            padding: 32,
            bgColor: '#f6edda',
            glassBg: true,
            glassBlur: 32,
            glassFrost: 0.05,
            glassSheen: 0.1,
            borderWidth: 3,
            borderColor: '#26221c',
            borderRadius: 14,
            shadowMode: 'hard',
            shadowOffset: 5,
            shadowAlpha: 0.9,
            tiltDeg: -1.2,
            tape: true,
            tapeVariant: 'blue',
            captionFontSize: 14,
            outputWidth: 0
        },
        'sketch-note': {
            label: '手绘线稿 · sketch-note',
            padding: 28,
            bgColor: '#fbfaf5',
            bgMode: 'solid',
            glassBg: false,
            borderWidth: 2.5,
            borderColor: '#232323',
            borderRadius: 12,
            borderStyle: 'sketch',
            shadowMode: 'hard',
            shadowOffset: 0,
            tiltDeg: -0.6,
            tape: false,
            captionFontSize: 14,
            outputWidth: 0
        },
        'apple-glass': {
            label: '苹果浅蓝玻璃 · apple-light-blue-glass',
            padding: 28,
            bgMode: 'gradient',
            bgGradient: ['#fbfdff', '#eef7ff'],
            glassBg: true,
            glassBlur: 28,
            glassFrost: 0.22,
            borderWidth: 1,
            borderColor: 'rgba(37,99,235,0.35)',
            borderRadius: 22,
            shadowMode: 'soft',
            shadowOffset: 4,
            shadowAlpha: 0.12,
            tiltDeg: 0,
            tape: false,
            captionFontSize: 14,
            outputWidth: 0
        },
        'apple-tech': {
            label: '科技发布会 · apple-tech-gradient',
            padding: 32,
            bgMode: 'gradient',
            bgGradient: ['#141210', '#000000'],
            glassBg: true,
            glassBlur: 32,
            glassFrost: 0.08,
            bgOverlay: 'rgba(0,0,0,0.52)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.18)',
            borderRadius: 18,
            shadowMode: 'soft',
            shadowOffset: 3,
            shadowAlpha: 0.35,
            tiltDeg: 0,
            tape: false,
            captionFontSize: 14,
            outputWidth: 0
        },
        editorial: {
            label: '杂志编辑 · editorial-magazine',
            padding: 30,
            bgColor: '#faf9f6',
            bgMode: 'solid',
            glassBg: false,
            borderWidth: 1,
            borderColor: 'rgba(0,0,0,0.12)',
            borderRadius: 0,
            shadowMode: 'hard',
            shadowOffset: 0,
            tiltDeg: 0,
            tape: false,
            captionFontSize: 14,
            outputWidth: 0
        },
        finance: {
            label: '财经演播室 · finance-studio-cards',
            padding: 28,
            bgMode: 'gradient',
            bgGradient: ['#0d1422', '#0a0e17'],
            glassBg: true,
            glassBlur: 24,
            glassFrost: 0.06,
            bgOverlay: 'rgba(10,14,23,0.62)',
            borderWidth: 1,
            borderColor: 'rgba(0,212,170,0.55)',
            borderRadius: 8,
            shadowMode: 'glow',
            shadowOffset: 8,
            glowColor: 'rgba(0,212,170,0.38)',
            tiltDeg: 0,
            tape: false,
            captionFontSize: 14,
            outputWidth: 0
        },
        ink: {
            label: '墨蓝手稿 · ink-framework',
            padding: 30,
            bgColor: '#f7f2e7',
            bgMode: 'solid',
            glassBg: false,
            borderWidth: 2,
            borderColor: 'rgba(47,78,121,0.65)',
            borderRadius: 6,
            shadowMode: 'soft',
            shadowOffset: 2,
            shadowAlpha: 0.08,
            tiltDeg: 0,
            tape: false,
            captionFontSize: 14,
            outputWidth: 0
        },
        manifesto: {
            label: '宣言海报 · manifesto-poster',
            padding: 28,
            bgColor: '#f2efe6',
            bgMode: 'solid',
            glassBg: false,
            borderWidth: 3,
            borderColor: '#141414',
            borderRadius: 0,
            shadowMode: 'hard',
            shadowOffset: 0,
            tiltDeg: 0,
            tape: false,
            captionFontSize: 14,
            outputWidth: 0
        },
        newspaper: {
            label: '档案剪报 · newspaper-evidence',
            padding: 28,
            bgColor: '#f5f0e8',
            bgMode: 'solid',
            glassBg: false,
            borderWidth: 1,
            borderColor: 'rgba(26,26,26,0.18)',
            borderRadius: 2,
            shadowMode: 'hard',
            shadowOffset: 3,
            shadowAlpha: 0.14,
            tiltDeg: -1.0,
            tape: true,
            tapeVariant: 'yellow',
            captionFontSize: 14,
            outputWidth: 0
        },
        chat: {
            label: '对话条同款',
            padding: 20,
            bgColor: '#f6edda',
            glassBg: true,
            glassBlur: 28,
            glassFrost: 0.16,
            borderWidth: 2,
            borderColor: '#26221c',
            borderRadius: 12,
            shadowMode: 'hard',
            shadowOffset: 3,
            shadowAlpha: 0.45,
            tiltDeg: 0,
            tape: false,
            captionFontSize: 14,
            outputWidth: 0
        },
        polaroid: {
            label: '拍立得',
            padding: 28,
            bgColor: '#fffdf6',
            glassBg: true,
            glassBlur: 24,
            glassFrost: 0.18,
            borderWidth: 2,
            borderColor: '#26221c',
            borderRadius: 4,
            shadowMode: 'hard',
            shadowOffset: 4,
            shadowAlpha: 0.35,
            tiltDeg: 0,
            tape: false,
            captionFontSize: 15,
            outputWidth: 0,
            extraBottomPadding: 48
        },
        minimal: {
            label: '简约白边',
            padding: 24,
            bgColor: '#ffffff',
            bgMode: 'solid',
            glassBg: false,
            borderWidth: 0,
            borderColor: '#26221c',
            borderRadius: 0,
            shadowMode: 'hard',
            shadowOffset: 0,
            shadowAlpha: 0,
            tiltDeg: 0,
            tape: false,
            captionFontSize: 13,
            outputWidth: 0
        }
    };

    function mergeOptions(options) {
        let presetKey = options?.preset || 'paper-collage';
        if (PRESET_ALIASES[presetKey]) presetKey = PRESET_ALIASES[presetKey];
        if (!PRESETS[presetKey]) presetKey = 'paper-collage';
        const merged = { ...PRESETS[presetKey], ...options, preset: presetKey };
        // 预览保留玻璃模糊；模糊本身在小画布上完成（见 drawBlurredImageBackground）
        return merged;
    }

    function scaledUi(value, uiScale, minVal) {
        const v = Math.round(Number(value) * uiScale);
        return Math.max(minVal ?? 1, v);
    }

    function measureFrame(image, options) {
        const opts = mergeOptions(options);
        if (opts.plain || opts.preset === 'none') {
            const size = resolveDrawSize(image, opts);
            const drawW = Math.max(1, size.drawW || 1);
            const drawH = Math.max(1, size.drawH || 1);
            return {
                width: drawW,
                height: drawH,
                drawW,
                drawH,
                padding: 0,
                borderWidth: 0,
                borderRadius: 0,
                shadowOffset: 0,
                captionLines: [],
                captionFontSize: 14,
                uiScale: size.uiScale || 1,
                opts
            };
        }
        const size = resolveDrawSize(image, opts);
        const { drawW, drawH, uiScale } = size;

        const padding = scaledUi(opts.padding, uiScale, 8);
        const borderWidth = scaledUi(opts.borderWidth, uiScale, 0);
        const shadowOffset = scaledUi(opts.shadowOffset, uiScale, 0);
        const borderRadius = scaledUi(opts.borderRadius, uiScale, 0);
        const extraBottom = scaledUi(opts.extraBottomPadding || 0, uiScale, 0);
        const captionFontSize = scaledUi(opts.captionFontSize, uiScale, 12);
        const caption = String(opts.caption || '').trim();
        const shadowExtra = opts.shadowMode === 'glow'
            ? scaledUi((opts.shadowOffset || 0) * 4, uiScale, 0)
            : shadowOffset;

        if (!drawW || !drawH) {
            return {
                width: 100,
                height: 100,
                drawW: 80,
                drawH: 80,
                padding,
                borderWidth,
                borderRadius,
                shadowOffset,
                captionLines: [],
                captionFontSize,
                uiScale,
                opts
            };
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = `${captionFontSize}px "Noto Sans SC", sans-serif`;
        const captionLines = caption
            ? wrapLines(ctx, caption, Math.max(40, drawW - 8))
            : [];
        const captionBlockH = captionLines.length
            ? captionLines.length * captionFontSize * 1.45 + 12
            : 0;

        // 景深开启即预留探出边距（卡片缩小后角色可探出）
        const useDofPad = !!(opts.depthOfField);
        const overflow = Number(opts.popOutOverflow) || 0.16;
        const popPadTop = useDofPad ? Math.ceil(drawH * overflow) : 0;
        const popPadBottom = useDofPad ? Math.ceil(drawH * overflow * 0.55) : 0;
        const popPadSides = useDofPad ? Math.ceil(drawW * 0.08) : 0;

        const innerW = drawW + borderWidth * 2;
        const innerH = drawH + borderWidth * 2;
        const cardW = innerW + padding * 2 + popPadSides * 2;
        const cardH = innerH + padding * 2 + extraBottom + captionBlockH + popPadTop + popPadBottom;
        const width = cardW + shadowExtra + popPadSides * 2;
        const height = cardH + shadowExtra;

        return {
            width: Math.ceil(width),
            height: Math.ceil(height),
            drawW,
            drawH,
            padding,
            borderWidth,
            borderRadius,
            shadowOffset,
            popPadTop,
            popPadBottom,
            popPadSides,
            captionLines,
            captionFontSize,
            uiScale,
            opts
        };
    }

    function renderPlainImage(image, options) {
        const measured = measureFrame(image, { ...(options || {}), preset: 'none' });
        const canvas = document.createElement('canvas');
        canvas.width = measured.drawW;
        canvas.height = measured.drawH;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const imgW = image.naturalWidth || image.width || measured.drawW;
        const imgH = image.naturalHeight || image.height || measured.drawH;
        ctx.drawImage(image, 0, 0, imgW, imgH, 0, 0, measured.drawW, measured.drawH);
        drawBubbles(ctx, mergeOptions(options || {}).bubbles, 0, 0, measured.drawW, measured.drawH, measured.uiScale || 1);
        return canvas;
    }

    function renderStickerFrame(image, options) {
        const measured = measureFrame(image, options);
        const opts = measured.opts;
        if (opts.plain || opts.preset === 'none') {
            return renderPlainImage(image, options);
        }
        const {
            bgColor,
            borderColor,
            tiltDeg,
            tape,
            tapeVariant,
            borderStyle
        } = opts;

        const padding = measured.padding;
        const borderWidth = measured.borderWidth;
        const borderRadius = measured.borderRadius;
        const drawW = measured.drawW;
        const drawH = measured.drawH;
        const uiScale = measured.uiScale;
        const extraBottom = scaledUi(opts.extraBottomPadding || 0, uiScale, 0);
        const useGlass = opts.glassBg !== false && opts.bgMode !== 'solid';

        const canvasW = measured.width;
        const canvasH = measured.height;
        const popPadTop = measured.popPadTop || 0;
        const popPadBottom = measured.popPadBottom || 0;
        const popPadSides = measured.popPadSides || 0;
        const cardW = drawW + borderWidth * 2 + padding * 2 + popPadSides * 2;
        const cardH = drawH + borderWidth * 2 + padding * 2 + extraBottom + popPadTop + popPadBottom + (
            measured.captionLines.length
                ? measured.captionLines.length * measured.captionFontSize * 1.45 + 12
                : 0
        );

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const imgW = image.naturalWidth || image.width;
        const imgH = image.naturalHeight || image.height;

        const matteFg = opts.matteForeground;
        const useDof = opts.depthOfField && matteFg && (matteFg.naturalWidth || matteFg.width);

        // 景深：外层磨砂板 + 可缩小空心卡片 + 独立角色（可探出）
        if (useDof) {
            drawFrostPlate(ctx, image, 0, 0, canvasW, canvasH, opts, drawW, 0);
        } else {
            drawCardBackground(ctx, image, 0, 0, canvasW, canvasH, opts, drawW);
        }

        if (tiltDeg) {
            ctx.save();
            ctx.translate(canvasW / 2, canvasH / 2);
            ctx.rotate((Number(tiltDeg) * Math.PI) / 180);
            ctx.translate(-canvasW / 2, -canvasH / 2);
        }

        if (useDof) {
            drawFrostPlate(ctx, image, 0, 0, cardW, cardH, opts, drawW, 14);
        } else {
            drawCardBackground(ctx, image, 0, 0, cardW, cardH, opts, drawW);
        }

        if (tape && !useDof) {
            const ts = uiScale;
            const variant = tapeVariant || 'warm';
            drawTape(ctx, padding + 8 * ts, padding - 6 * ts, 52 * ts, 16 * ts, variant);
            if (variant !== 'yellow') {
                drawTape(ctx, cardW - padding - 60 * ts, padding - 6 * ts, 52 * ts, 16 * ts, 'default');
            }
        }

        const imgX = padding + popPadSides;
        const imgY = padding + popPadTop;

        if (useDof) {
            drawDofCardAndSubject(
                ctx,
                matteFg,
                imgX,
                imgY,
                drawW,
                drawH,
                borderRadius,
                borderWidth,
                borderColor,
                opts
            );
        } else {
            drawImageShadow(ctx, imgX, imgY, drawW, drawH, borderRadius, opts);
            ctx.save();
            clipFramePath(ctx, imgX, imgY, drawW, drawH, borderRadius, borderStyle);
            ctx.clip();
            ctx.drawImage(image, 0, 0, imgW, imgH, imgX, imgY, drawW, drawH);
            ctx.restore();

            if (borderWidth > 0) {
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = borderWidth;
                strokeFramePath(ctx, imgX, imgY, drawW, drawH, borderRadius, borderStyle);
            }
        }

        drawBubbles(ctx, opts.bubbles, imgX, imgY, drawW, drawH, uiScale);

        if (measured.captionLines.length) {
            ctx.font = `${measured.captionFontSize}px "Noto Sans SC", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            let captionY = imgY + drawH + borderWidth + 14 + extraBottom;
            const captionBlockHeight = measured.captionLines.length * measured.captionFontSize * 1.45;
            const captionBg = opts.captionBg || (useGlass ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.72)');
            ctx.fillStyle = captionBg;
            roundRect(ctx, padding, captionY - 6, cardW - padding * 2, captionBlockHeight + 10, 8);
            ctx.fill();
            ctx.fillStyle = opts.captionColor || '#26221c';
            for (const line of measured.captionLines) {
                ctx.fillText(line, cardW / 2, captionY);
                captionY += measured.captionFontSize * 1.45;
            }
        }

        if (tiltDeg) ctx.restore();

        return canvas;
    }

    function canvasToBlob(canvas, type = 'image/png', quality) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('生成 PNG 失败'));
            }, type, quality);
        });
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /** 上半正常、下半发黑：GPU/canvas 在大图 + blur 时的典型故障 */
    function isCanvasCorrupt(canvas) {
        if (!canvas || !canvas.width || !canvas.height) return true;
        try {
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;
            const samples = [
                [0.2, 0.12, 0.6, 0.35],
                [0.2, 0.55, 0.6, 0.35]
            ];
            for (const [rx, ry, rw, rh] of samples) {
                const x0 = Math.floor(w * rx);
                const y0 = Math.floor(h * ry);
                const sw = Math.max(1, Math.floor(w * rw));
                const sh = Math.max(1, Math.floor(h * rh));
                const data = ctx.getImageData(x0, y0, sw, sh).data;
                let dark = 0;
                let total = 0;
                for (let i = 0; i < data.length; i += 16) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];
                    if (a < 12) continue;
                    total += 1;
                    if (r + g + b < 48) dark += 1;
                }
                if (total > 24 && dark / total > 0.82) return true;
            }
            return false;
        } catch (_) {
            return false;
        }
    }

    function downscaleImage(image, maxW) {
        const imgW = image.naturalWidth || image.width || 0;
        const imgH = image.naturalHeight || image.height || 0;
        if (!maxW || !imgW || imgW <= maxW) return image;
        const scale = maxW / imgW;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(imgW * scale));
        canvas.height = Math.max(1, Math.round(imgH * scale));
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    /**
     * 安全渲染：全分辨率失败（下半发黑）时降采样 / 关玻璃模糊重试。
     * @returns {{ canvas: HTMLCanvasElement, degraded: boolean, reason: string }}
     */
    function renderStickerFrameSafe(image, options = {}) {
        const baseOpts = { ...(options || {}) };
        let canvas = renderStickerFrame(image, baseOpts);
        if (!isCanvasCorrupt(canvas)) {
            return { canvas, degraded: false, reason: '' };
        }

        const caps = [1600, 1280, 960, 720];
        for (const cap of caps) {
            const source = downscaleImage(image, cap);
            canvas = renderStickerFrame(source, {
                ...baseOpts,
                previewMaxWidth: Math.min(Number(baseOpts.previewMaxWidth) || cap, cap),
                outputWidth: 0
            });
            if (!isCanvasCorrupt(canvas)) {
                return { canvas, degraded: true, reason: `downscale_${cap}` };
            }
        }

        canvas = renderStickerFrame(downscaleImage(image, 1280), {
            ...baseOpts,
            glassBg: false,
            previewMaxWidth: 1280,
            outputWidth: 0
        });
        if (!isCanvasCorrupt(canvas)) {
            return { canvas, degraded: true, reason: 'no_glass' };
        }

        return { canvas, degraded: true, reason: 'still_corrupt' };
    }

    global.StickerFrame = {
        PRESETS,
        BUBBLE_DEFAULTS,
        mergeOptions,
        measureFrame,
        renderStickerFrame,
        renderStickerFrameSafe,
        isCanvasCorrupt,
        downscaleImage,
        canvasToBlob,
        blobToBase64,
        resolveImageRect,
        bubbleBoxAt,
        hitTestBubble
    };
})(typeof window !== 'undefined' ? window : globalThis);
