const fs = require('fs');
const path = require('path');

async function analyzeErrors() {
  const errors = {
    typecheck: readLogFile('typecheck.log'),
    lint: readLogFile('lint.log'),
    test: readLogFile('test.log')
  };

  const prompt = `
You are analyzing errors from a CI/CD pipeline for a TypeScript/Node.js project. Please analyze these errors and create structured GitHub issues.

TYPECHECK ERRORS:
${errors.typecheck}

LINT ERRORS:
${errors.lint}

TEST ERRORS:
${errors.test}

For each category of errors, create a JSON response with the following structure:
{
  "issues": [
    {
      "title": "Brief descriptive title",
      "body": "Detailed description with:\n- Root cause analysis\n- Step-by-step fix instructions\n- Code examples if applicable\n- Priority level (high/medium/low)",
      "labels": ["bug", "ci", "typescript"],
      "category": "typecheck|lint|test"
    }
  ]
}

Focus on:
1. Grouping related errors into single issues
2. Providing actionable fix instructions
3. Identifying root causes (like missing dependencies)
4. Prioritizing critical errors first

Return only valid JSON.
`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ANTHROPIC_API_KEY}`,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    const data = await response.json();
    const analysisResult = JSON.parse(data.content[0].text);
    
    // Write analysis to file for GitHub Action to use
    fs.writeFileSync('error-analysis.json', JSON.stringify(analysisResult, null, 2));
    console.log('Error analysis completed and saved to error-analysis.json');
    
  } catch (error) {
    console.error('Error calling Claude API:', error);
    process.exit(1);
  }
}

function readLogFile(filename) {
  try {
    return fs.readFileSync(filename, 'utf8');
  } catch (error) {
    return 'No errors found';
  }
}

analyzeErrors();