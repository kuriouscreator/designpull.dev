#!/usr/bin/env node

import { Command } from 'commander';
import { runInit } from './init.js';
import { runSync } from './sync.js';
import { runGenerate } from './generate.js';
import { runDoctor } from './doctor.js';

const program = new Command();

program
  .name('designpull')
  .description('Code in. Design out. Ship faster.')
  .version('0.1.0');

program
  .command('init')
  .description('Set up your design-token.md and Figma connection interactively')
  .option('-o, --output <dir>', 'Output directory', process.cwd())
  .action(async (options) => {
    await runInit(options.output);
  });

program
  .command('sync')
  .description('Parse design-token.md and write variables to Figma')
  .option('-o, --output <dir>', 'Project directory', process.cwd())
  .option('--dry-run', 'Parse tokens and preview without writing to Figma')
  .action(async (options) => {
    await runSync(options.output, { dryRun: options.dryRun });
  });

program
  .command('generate')
  .description('Generate components in Figma from your token system')
  .option('-o, --output <dir>', 'Project directory', process.cwd())
  .action(async (options) => {
    await runGenerate(options.output);
  });

program
  .command('doctor')
  .description('Check your DesignPull environment health')
  .option('-o, --output <dir>', 'Project directory', process.cwd())
  .action(async (options) => {
    await runDoctor(options.output);
  });

program.parse();
