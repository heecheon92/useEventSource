import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"], // entry 여러 개도 가능: ['src/index.ts', 'src/other.ts']
	format: ["esm", "cjs"], // 출력 포맷
	dts: true, // 타입 선언 파일 생성
	sourcemap: true,
	clean: true, // 빌드 전에 dist 비우기
	minify: false, // 라이브러리는 보통 false, 필요하면 true
	target: "es2020",
	external: ["react", "react-dom", "zod", "event-source-polyfill"], // 번들에서 제외할 패키지
});
