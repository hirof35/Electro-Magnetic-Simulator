class Vector2D {
    constructor(public x: number, public y: number) {}
    add(v: Vector2D) { return new Vector2D(this.x + v.x, this.y + v.y); }
    sub(v: Vector2D) { return new Vector2D(this.x - v.x, this.y - v.y); }
    scale(n: number) { return new Vector2D(this.x * n, this.y * n); }
    magnitude() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    normalize() {
        const mag = this.magnitude();
        return mag === 0 ? new Vector2D(0, 0) : this.scale(1 / mag);
    }
}

// （Vector2D クラスは変更ないため省略）

class Particle {
    public force = new Vector2D(0, 0);
    private prevPosition!: Vector2D;

    // ★ 初期状態を記憶しておくためのプロパティ
    private initPosition: Vector2D;
    private initVelocity: Vector2D;

    constructor(
        public id: string,
        public position: Vector2D,
        public velocity: Vector2D,
        public mass: number,
        public charge: number,
        public color: string
    ) {
        // 初期状態を保存
        this.initPosition = position;
        this.initVelocity = velocity;
        this.setupVerlet();
    }

    // ベルレ積分の初期位置逆算をメソッド化
    private setupVerlet() {
        const dtDummy = 0.01;
        this.prevPosition = this.position.sub(this.velocity.scale(dtDummy));
    }

    // ★ 追加: 粒子を最初の状態に戻すメソッド
    public reset() {
        this.position = this.initPosition;
        this.velocity = this.initVelocity;
        this.force = new Vector2D(0, 0);
        this.setupVerlet();
    }

    resetForce() { this.force = new Vector2D(0, 0); }
    applyForce(f: Vector2D) { this.force = this.force.add(f); }

    update(dt: number) {
        const acceleration = this.force.scale(1 / this.mass);
        const nextPosition = this.position.scale(2)
            .sub(this.prevPosition)
            .add(acceleration.scale(dt * dt));

        this.velocity = nextPosition.sub(this.prevPosition).scale(1 / (2 * dt));
        this.prevPosition = this.position;
        this.position = nextPosition;
    }
}

class PhysicsSimulator {
    // 外部から数値を直接変更できるように public に変更
    public K_COULOMB = 50000; 

    constructor(
        public particles: Particle[],
        public uniformMagneticFieldZ: number 
    ) {}

    step(dt: number) {
        this.particles.forEach(p => p.resetForce());

        // 1. 静電気力の計算 (リアルタイムの K_COULOMB と charge を使用)
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const p1 = this.particles[i];
                const p2 = this.particles[j];
                const direction = p2.position.sub(p1.position);
                const distance = direction.magnitude();

                if (distance < 20) continue; // 密着時の無限遠爆発ガード

                const forceMagnitude = (this.K_COULOMB * p1.charge * p2.charge) / (distance * distance);
                const forceVector = direction.normalize().scale(forceMagnitude);

                p1.applyForce(forceVector.scale(-1));
                p2.applyForce(forceVector);
            }
        }

        // 2. 磁力（ローレンツ力）の計算 (リアルタイムの uniformMagneticFieldZ を使用)
        this.particles.forEach(p => {
            const forceX = p.charge * p.velocity.y * this.uniformMagneticFieldZ;
            const forceY = -p.charge * p.velocity.x * this.uniformMagneticFieldZ;
            p.applyForce(new Vector2D(forceX, forceY));
        });

        this.particles.forEach(p => p.update(dt));
    }
}

// ==========================================
// 画面・UIの連携管理クラス
// ==========================================
class CanvasApp {
    private ctx: CanvasRenderingContext2D;
    private simulator: PhysicsSimulator;
    private lastTime: number = 0;
    private p1: Particle;
    private p2: Particle;

    // ★ 追加: シミュレーションの実行状態フラグ（最初は停止状態にする）
    private isRunning: boolean = false;

    constructor(private canvas: HTMLCanvasElement) {
        this.ctx = canvas.getContext('2d')!;
        
        // 粒子の初期化 (初期位置と初速)
        this.p1 = new Particle("plus", new Vector2D(200, 300), new Vector2D(30, -60), 1, 5, "#ff4d4d");
        this.p2 = new Particle("minus", new Vector2D(500, 300), new Vector2D(-30, 60), 1, -5, "#3399ff");

        this.simulator = new PhysicsSimulator([this.p1, this.p2], 2.0);

        this.setupUIListeners();
    }

    private setupUIListeners() {
        const bindInput = (inputId: string, valueId: string, callback: (val: number) => void) => {
            const inputEl = document.getElementById(inputId) as HTMLInputElement;
            const valueEl = document.getElementById(valueId) as HTMLSpanElement;
            inputEl.addEventListener('input', () => {
                const val = parseFloat(inputEl.value);
                valueEl.textContent = inputEl.value;
                callback(val);
            });
        };

        bindInput('kCoulomb', 'kCoulombVal', (val) => this.simulator.K_COULOMB = val);
        bindInput('magField', 'magFieldVal', (val) => this.simulator.uniformMagneticFieldZ = val);
        bindInput('q1', 'q1Val', (val) => this.p1.charge = val);
        bindInput('q2', 'q2Val', (val) => this.p2.charge = val);

        // ★ 追加: スタート/ストップボタンのイベント
        const startStopBtn = document.getElementById('startStopBtn') as HTMLButtonElement;
        startStopBtn.addEventListener('click', () => {
            this.isRunning = !this.isRunning; // フラグ反転
            if (this.isRunning) {
                startStopBtn.textContent = 'ストップ';
                startStopBtn.classList.add('paused');
                this.lastTime = performance.now(); // 再開時の時間ズレを防止
            } else {
                startStopBtn.textContent = 'スタート';
                startStopBtn.classList.remove('paused');
            }
        });

        // ★ 追加: リセットボタンのイベント
        const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
        resetBtn.addEventListener('click', () => {
            // シミュレーションを停止状態に戻す
            this.isRunning = false;
            startStopBtn.textContent = 'スタート';
            startStopBtn.classList.remove('paused');

            // 粒子を初期化
            this.p1.reset();
            this.p2.reset();
            
            // 画面を再描画（停止中の状態を見せるため）
            this.render(); 
        });
    }

    public start() {
        this.lastTime = performance.now();
        const loop = (currentTime: number) => {
            let dt = (currentTime - this.lastTime) / 1000;
            if (dt > 0.1) dt = 0.1;
            this.lastTime = currentTime;

            // ★ 実行中のみ物理演算ステップを進める
            if (this.isRunning) {
                this.simulator.step(dt);
            }

            // 描画は常に呼び出す（パラメータ変更を即時反映するため）
            this.render();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    // 描画ロジックを独立したメソッドに分離
    private render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = "#1e1e1e";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 状態テキスト
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        this.ctx.font = "14px monospace";
        this.ctx.fillText(this.isRunning ? "▶ RUNNING" : "⏸ PAUSED", 20, 30);

        this.simulator.particles.forEach(p => {
            this.ctx.beginPath();
            this.ctx.arc(p.position.x, p.position.y, 10, 0, Math.PI * 2);
            this.ctx.fillStyle = p.charge === 0 ? "#777777" : p.color;
            this.ctx.fill();

            this.ctx.beginPath();
            this.ctx.moveTo(p.position.x, p.position.y);
            this.ctx.lineTo(p.position.x + p.velocity.x * 0.4, p.position.y + p.velocity.y * 0.4);
            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
            this.ctx.lineWidth = 1.5;
            this.ctx.stroke();
        });
    }
}

// 起動コード
window.addEventListener('load', () => {
    const canvas = document.getElementById('simCanvas') as HTMLCanvasElement;
    if (canvas) {
        const app = new CanvasApp(canvas);
        app.start();
    }
});