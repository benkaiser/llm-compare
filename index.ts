// import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { experimental_wrapLanguageModel, generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai';
import { createAzure } from '@ai-sdk/azure';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import * as config from './config.json';
import * as Diff from 'diff';
import * as Colors from 'colors.ts';
import { getCacheMiddleware } from './cachedModel';
import fs from 'fs';
import path from 'path';


Colors.enable();

const azure = createAzure({
  resourceName: config.keys['azure-resource-name'],
  apiKey: config.keys['azure-api-key'],
});

const fireworks = createOpenAI({
  name: 'fireworks',
  apiKey: config.keys.fireworks,
  baseURL: 'https://api.fireworks.ai/inference/v1',
});

const google = createGoogleGenerativeAI({
  apiKey: config.keys.google,
});


const anthropic = createAnthropic({
  apiKey: config.keys.anthropic,
});

const providers = [
  {
    name: 'Llama 3.1 405B',
    creator: 'Meta',
    model: fireworks('accounts/fireworks/models/llama-v3p1-405b-instruct')
  },
  {
    name: 'Llama 3.1 70B',
    creator: 'Meta',
    model: fireworks('accounts/fireworks/models/llama-v3p1-70b-instruct')
  },
  {
    name: 'Llama 3.1 8B',
    creator: 'Meta',
    model: fireworks('accounts/fireworks/models/llama-v3p1-8b-instruct')
  },
  {
    name: 'Llama 3.3 70B',
    creator: 'Meta',
    model: fireworks('accounts/fireworks/models/llama-v3p3-70b-instruct')
  },
  {
    name: 'GPT 4o',
    creator: 'OpenAI',
    model: azure(config.keys['azure-gpt4o-deployment-name'])
  },
  {
    name: 'GPT 4o mini',
    creator: 'OpenAI',
    model: azure(config.keys['azure-gpt4o-mini-deployment-name'])
  },
  {
    name: 'Gemini 1.5 Pro',
    creator: 'Google',
    model: google('gemini-1.5-pro-latest')
  },
  {
    name: 'Gemini 1.5 Flash',
    creator: 'Google',
    model: google('gemini-1.5-flash-latest')
  },
  {
    name: 'Gemini 2.0 Flash',
    creator: 'Google',
    model: google('gemini-2.0-flash-exp')
  },
  {
    name: 'Claude 3.5 Haiku',
    creator: 'Anthropic',
    model: anthropic('claude-3-5-haiku-latest')
  },
  {
    name: 'Claude 3.5 Sonnet',
    creator: 'Anthropic',
    model: anthropic('claude-3-5-sonnet-latest')
  }
];

interface ILLMResult {
  model: string;
  expected: string;
  response: string;
  pass: boolean;
}

const results: ILLMResult[] = [];

// Fuzzy match function that passes a result if expected is contained in response, ignoring case and whitespace
function areResponsesEssentiallyEqual(expected: string, response: string): boolean {
  return response.toLowerCase().replace(/\s/g, '').includes(expected.toLowerCase().replace(/\s/g, ''));
}

Promise.all(config.tests.map(async test => {
  await Promise.all(providers.map(async provider => {
    console.log('Running test for', provider.name);
    const wrappedLanguageModel = experimental_wrapLanguageModel({
      model: provider.model,
      middleware: getCacheMiddleware(provider.name),
    });
    const { text } = await generateText({
      model: wrappedLanguageModel,
      prompt: test.prompt,
      temperature: 0,
      maxTokens: test.maxTokens || 200,
    });

    results.push({
      model: provider.name,
      response: text,
      expected: test.answer,
      pass: areResponsesEssentiallyEqual(test.answer, text)
    });
  }));
})).then(() => {
  // convert results into a table of model on one axis, test on the other, and pass/fail in the cells
  const table: string[][] = [];
  table.push(['', ...config.tests.map(test => test.name)]);
  providers.forEach(provider => {
    table.push([provider.name, ...results.filter(result => result.model === provider.name).map(result => result.pass ? '✅' : '❌')]);
  });
  console.table(table);
  // Write a HTML file, with multiple tables, one for each test, showing the model in one column, and a check or cross in the second column
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
  </head>
  <body>
  ${config.tests.map(test => `
    <h2>${test.name}</h2>
    <p>${test.prompt}</p>
    <table>
      <tr>
        <th>Model</th>
        <th>Pass</th>
      </tr>
      ${providers.map(provider => `
        <tr>
          <td>${provider.name}</td>
          <td>${results.find(result => result.model === provider.name && result.expected === test.answer)?.pass ? '✅' : '❌'}</td>
        </tr>
      `).join('')}
    </table>
  `).join('')}
  </body>
  </html>
  `;
  fs.writeFileSync('results.html', html);

  // now output the same file, but also include the expected and actual responses where a test failed
  const htmlWithResponses = `
  <!DOCTYPE html>
  <html>
  <head>
  </head>
  <body>
  ${config.tests.map(test => `
    <h2>${test.name}</h2>
    <p>${test.prompt}</p>
    <table>
      <tr>
        <th>Model</th>
        <th>Pass</th>
        <th>Expected</th>
        <th>Response</th>
      </tr>
      ${providers.map(provider => {
        const result = results.find(result => result.model === provider.name && result.expected === test.answer);
        return `
          <tr>
            <td>${provider.name}</td>
            <td>${result?.pass ? '✅' : '❌'}</td>
            <td>${result && !result.pass ? result.expected : ''}</td>
            <td>${result && !result.pass ? result.response : ''}</td>
          </tr>
        `;
      }).join('')}
    </table>
  `).join('')}
  </body>
  </html>
  `;
  fs.writeFileSync('results-with-responses.html', htmlWithResponses);

  // print the responses vs expected for each test grouped by model
  providers.forEach(provider => {
    console.log('Results for', provider.name);
    results.filter(result => result.model === provider.name).forEach(result => {
      if (result.pass) {
        return;
      }
      const diff = Diff.diffChars(result.expected.toLowerCase(), result.response.toLowerCase());
      diff.forEach((part) => {
        // green for additions, red for deletions
        if (!part.value) {
          return;
        }
        if (part.added) {
          process.stdout.write(part.value.green);
        } else if (part.removed) {
          process.stdout.write(part.value.red);
        } else {
          process.stdout.write(part.value);
        }
      });
      console.log('\n');
    });
  });

});
