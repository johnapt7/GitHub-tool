const fs = require('fs');
const { execSync } = require('child_process');

async function createIssues() {
  try {
    const analysisData = JSON.parse(fs.readFileSync('error-analysis.json', 'utf8'));
    
    for (const issue of analysisData.issues) {
      const title = issue.title;
      const body = issue.body;
      const labels = issue.labels.join(',');
      
      // Use GitHub CLI to create issue
      const command = `gh issue create --title "${title}" --body "${body}" --label "${labels}"`;
      
      try {
        const result = execSync(command, { encoding: 'utf8' });
        console.log(`Created issue: ${title}`);
        console.log(`Issue URL: ${result.trim()}`);
      } catch (error) {
        console.error(`Failed to create issue: ${title}`, error.message);
      }
    }
    
  } catch (error) {
    console.error('Error creating issues:', error);
    process.exit(1);
  }
}

createIssues();