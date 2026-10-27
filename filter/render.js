/* GPU cel shading plus a vector character head. The same canvas is previewed and exported. */
"use strict";
window.CharmRender = (() => {
  const T = CharmTracking,
    art = CharmCharacter;
  class Toon {
    constructor() {
      this.canvas = document.createElement("canvas");
      this.gl = this.canvas.getContext("webgl", {
        alpha: false,
        preserveDrawingBuffer: true,
        premultipliedAlpha: false,
      });
      if (!this.gl) return;
      const gl = this.gl;
      const vertex =
        "attribute vec2 p;varying vec2 uv;void main(){uv=(p+1.)*.5;gl_Position=vec4(p,0.,1.);}";
      const fragment = `precision mediump float;
      varying vec2 uv; uniform sampler2D frame; uniform vec2 pixel; uniform float amount;
      float l(vec3 c){return dot(c,vec3(.299,.587,.114));}
      void main(){
        vec2 v=vec2(uv.x,1.-uv.y); vec3 original=texture2D(frame,v).rgb;
        vec3 smoothColor=original*2.; float weights=2.;
        for(int x=-2;x<=2;x++)for(int y=-2;y<=2;y++){
          vec3 sampleColor=texture2D(frame,v+vec2(float(x),float(y))*pixel*1.6).rgb;
          float weight=exp(-dot(sampleColor-original,sampleColor-original)*18.);
          smoothColor+=sampleColor*weight;weights+=weight;
        }
        smoothColor/=weights;
        float light=l(smoothColor);float band=floor(light*4.+.5)/4.;
        vec3 tone=mix(vec3(.12,.065,.17),vec3(.78,.34,.65),band);
        float skin=step(smoothColor.b*1.12,smoothColor.r)*step(smoothColor.g*.93,smoothColor.r)*step(.24,light)*step(smoothColor.b,smoothColor.g);
        vec3 pink=mix(vec3(.60,.32,.44),vec3(.91,.65,.68),band);
        vec3 toon=mix(tone,pink,skin);
        float dx=l(texture2D(frame,v+vec2(pixel.x*2.,0.)).rgb)-l(texture2D(frame,v-vec2(pixel.x*2.,0.)).rgb);
        float dy=l(texture2D(frame,v+vec2(0.,pixel.y*2.)).rgb)-l(texture2D(frame,v-vec2(0.,pixel.y*2.)).rgb);
        toon=mix(toon,vec3(.055,.035,.085),smoothstep(.12,.32,length(vec2(dx,dy)))*.93);
        gl_FragColor=vec4(mix(original,toon,amount),1.);
      }`;
      const shader = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
          throw Error(gl.getShaderInfoLog(s));
        return s;
      };
      this.program = gl.createProgram();
      gl.attachShader(this.program, shader(gl.VERTEX_SHADER, vertex));
      gl.attachShader(this.program, shader(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw Error("Toon renderer could not initialize");
      gl.useProgram(this.program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const loc = gl.getAttribLocation(this.program, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.pixel = gl.getUniformLocation(this.program, "pixel");
      this.amount = gl.getUniformLocation(this.program, "amount");
    }
    draw(video, amount) {
      const w = Math.min(1280, video.videoWidth),
        h = Math.round((w * video.videoHeight) / video.videoWidth);
      if (!w || !h) return video;
      if (!this.gl) return video;
      const gl = this.gl;
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.useProgram(this.program);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        video,
      );
      gl.uniform2f(this.pixel, 1 / w, 1 / h);
      gl.uniform1f(this.amount, amount);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return this.canvas;
    }
  }
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.g = canvas.getContext("2d", { alpha: false });
      this.body = document.createElement("canvas");
      this.bodyContext = this.body.getContext("2d");
      this.toon = new Toon();
      this.head = null;
      this.previousTime = 0;
      this.lastFrame = 0;
      this.faceOpacity = 0;
      this.settings = {
        amount: 0.85,
        mirror: true,
        collar: true,
        fullBody: true,
        expression: "live",
        sparks: true,
        background: "void",
        framing: "portrait",
      };
      this.width = 720;
      this.height = 1280;
      this.resize();
    }
    resize() {
      const landscape = this.settings.framing === "wide";
      this.width = landscape ? 1280 : 720;
      this.height = landscape ? 720 : 1280;
      this.canvas.width = this.body.width = this.width;
      this.canvas.height = this.body.height = this.height;
    }
    background(t) {
      const g = this.g,
        w = this.width,
        h = this.height;
      const grad = g.createRadialGradient(
        w * 0.5,
        h * 0.35,
        0,
        w * 0.5,
        h * 0.4,
        h * 0.8,
      );
      grad.addColorStop(
        0,
        this.settings.background === "rose" ? "#472b54" : "#302347",
      );
      grad.addColorStop(0.65, "#141123");
      grad.addColorStop(1, "#080b13");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      if (this.settings.sparks) {
        g.save();
        g.globalAlpha = 0.25;
        g.strokeStyle = "#a875d7";
        g.lineWidth = 1;
        const x = w * 0.5,
          y = h * 0.38,
          r = w * 0.39;
        g.translate(x, y);
        g.rotate(t * 0.035);
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.arc(0, 0, r * 0.91, 0, Math.PI * 2);
        g.stroke();
        for (let i = 0; i < 12; i++) {
          g.rotate(Math.PI / 6);
          g.beginPath();
          g.moveTo(r * 0.94, 0);
          g.lineTo(r * 1.03, 0);
          g.lineTo(r * 0.99, 6);
          g.stroke();
        }
        g.restore();
        for (let i = 0; i < 28; i++) {
          const x = (Math.sin(i * 93.7) * 0.5 + 0.5) * w,
            y = ((((i / 28) * h - t * (8 + (i % 3) * 5)) % h) + h) % h;
          g.fillStyle = `rgba(201,153,250,${0.14 + (Math.sin(t * 2 + i) + 1) * 0.14})`;
          g.fillRect(x, y, (i % 3) + 1, (i % 3) + 1);
        }
      }
    }
    smooth(raw, dt) {
      if (!this.head) {
        this.head = { ...raw, expression: { ...raw.expression } };
        return this.head;
      }
      const h = this.head,
        alpha = 1 - Math.exp(-dt * 22);
      if (Math.hypot(h.x - raw.x, h.y - raw.y) > this.width * 0.28) {
        this.head = null;
        return this.smooth(raw, dt);
      }
      for (const k of ["x", "y", "sx", "sy", "yaw"])
        h[k] += (raw[k] - h[k]) * alpha;
      h.roll +=
        Math.atan2(Math.sin(raw.roll - h.roll), Math.cos(raw.roll - h.roll)) *
        alpha;
      for (const k of Object.keys(raw.expression))
        h.expression[k] +=
          (raw.expression[k] - h.expression[k]) *
          (1 - Math.exp(-dt * (k.startsWith("blink") ? 48 : 24)));
      return h;
    }
    draw(video, tracker, now, preview = false) {
      const t = now / 1000,
        dt = Math.min(0.1, (now - (this.previousTime || now - 16)) / 1000);
      this.previousTime = now;
      const g = this.g,
        w = this.width,
        h = this.height;
      this.background(t);
      g.save();
      if (this.settings.mirror && !preview) {
        g.translate(w, 0);
        g.scale(-1, 1);
      }
      let head;
      if (preview) {
        head = art.preview(w, h, t);
        if (this.settings.fullBody)
          Object.assign(head, {
            x: w * 0.5,
            y: h * 0.13,
            sx: Math.min(w * 0.085, h * 0.06),
            sy: Math.min(w * 0.085, h * 0.06),
          });
        head.expression = {
          blinkL: Math.pow(Math.max(0, Math.sin(t * 1.5)), 32),
          blinkR: Math.pow(Math.max(0, Math.sin(t * 1.5)), 32),
          jaw: (Math.sin(t * 1.4) + 1) * 0.1,
          smile: 0.58,
          browL: 0.12,
          browR: 0.12,
        };
        this.faceOpacity = 1;
      } else if (video?.readyState >= 2) {
        const map = T.cover(video.videoWidth, video.videoHeight, w, h),
          seen =
            tracker?.latest &&
            now - tracker.lastSeen <
              Math.max(650, 2000 / Math.max(1, tracker.fps || 10));
        this.faceOpacity +=
          ((seen ? 1 : 0) - this.faceOpacity) * (1 - Math.exp(-dt * 15));
        if (seen) {
          const raw = tracker.latest,
            m = T.cover(tracker.input.width, tracker.input.height, w, h);
          head = this.smooth(
            {
              ...raw,
              x: raw.x * m.scale + m.x,
              y: raw.y * m.scale + m.y,
              sx: raw.sx * m.scale,
              sy: raw.sy * m.scale,
            },
            dt,
          );
        } else if (this.head && this.faceOpacity > 0.02) head = this.head;
        else this.head = null;
        if (head && !this.settings.fullBody) {
          g.save();
          g.globalAlpha = this.faceOpacity;
          art.back(g, head, t);
          g.restore();
        }
        if (!this.settings.fullBody) {
          const b = this.bodyContext;
          b.clearRect(0, 0, w, h);
          b.globalCompositeOperation = "source-over";
          const source = this.toon.draw(video, this.settings.amount);
          b.drawImage(source, map.x, map.y, map.w, map.h);
          if (tracker?.hasMask) {
            b.globalCompositeOperation = "destination-in";
            b.drawImage(tracker.mask, map.x, map.y, map.w, map.h);
            b.globalCompositeOperation = "source-over";
          }
          if (head && tracker?.hasMask) {
            b.save();
            b.globalCompositeOperation = "destination-out";
            b.globalAlpha = this.faceOpacity;
            b.translate(head.x, head.y);
            b.rotate(head.roll);
            b.scale(head.sx, head.sy);
            b.beginPath();
            b.ellipse(0, -0.4, 1.38, 1.95, 0, 0, Math.PI * 2);
            b.fill();
            b.restore();
          }
          g.drawImage(this.body, 0, 0);
        }
      }
      if (head) {
        g.save();
        g.globalAlpha = preview ? 1 : this.faceOpacity;
        if (this.settings.fullBody) {
          CharmPuppet.draw(g, head, tracker, w, h, this.settings.expression);
        } else {
          if (preview) art.back(g, head, t);
          if (this.settings.collar) art.collar(g, head);
          art.head(g, head, head.expression, t);
        }
        g.restore();
      }
      g.restore();
      this.lastFrame = now;
      return !!head && !preview;
    }
  }
  return { Renderer, Toon };
})();
