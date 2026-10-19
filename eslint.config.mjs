import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({})

export default [
	{
		// mock_control_box is a separate dev tool with its own package.json
		ignores: ['mock_control_box/**', 'pkg/**', '.yarn/**'],
	},
	...baseConfig,
]
