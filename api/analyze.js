// api/analyze.js
import { readFile } from 'fs/promises';
import { join } from 'path';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { assignments, gradeLevel, subject, courseName, filesData } = req.body;

    console.log('📊 Received analysis request');
    console.log('Grade:', gradeLevel, 'Subject:', subject);
    console.log('Files received:', filesData?.length || 0);

    // READ STANDARDS FROM FILE
    let standardsContent = '';
    try {
      // Read the standards file based on grade level and subject
      const standardsPath = join(process.cwd(), 'standards', `grade${gradeLevel}-${subject.toLowerCase()}.txt`);
      standardsContent = await readFile(standardsPath, 'utf-8');
      console.log('✅ Loaded standards from file:', standardsPath);
    } catch (err) {
      console.error('❌ Could not read standards file:', err.message);
      // Return error if standards file is missing
      return res.status(400).json({ 
        error: 'Standards file not found', 
        message: `No standards file found for Grade ${gradeLevel} ${subject}. Please add the file: standards/grade${gradeLevel}-${subject.toLowerCase()}.txt` 
      });
    }

    // Build the content array for Claude
    const messageContent = [
      {
        type: 'text',
        text: `You are an expert in California Common Core State Standards for Grade ${gradeLevel} ${subject}. 

Analyze this course's alignment with CA Common Core Standards:

COURSE: ${courseName}
GRADE LEVEL: ${gradeLevel}
SUBJECT: ${subject}

I'm providing you with ${assignments.length} assignments and ${filesData?.length || 0} attached documents (PDFs, worksheets, etc.).

ASSIGNMENTS:
${assignments.map((a, i) => `
Assignment ${i + 1}:
- Title: ${a.title}
- Description: ${a.description || 'No description'}
- Type: ${a.type}
- Points: ${a.maxPoints}
- Materials: ${a.materials?.length || 0} files
`).join('\n')}

${filesData && filesData.length > 0 ? `
ATTACHED DOCUMENTS:
${filesData.map((f, i) => `${i + 1}. ${f.fileName} (from assignment: ${f.assignmentTitle})`).join('\n')}

Please READ ALL the attached PDF documents carefully to understand what mathematical content is being taught.
` : 'No documents were attached to analyze.'}

CALIFORNIA COMMON CORE STANDARDS:
${standardsContent}

Provide a JSON response (ONLY JSON, no markdown) with this EXACT structure:
{
  "score": <number 0-100>,
  "summary": "<brief analysis based on actual content found in the documents>",
  "domains": {
    "7.RP (Ratios)": <percentage 0-100>,
    "7.NS (Number System)": <percentage 0-100>,
    "7.EE (Expressions)": <percentage 0-100>,
    "7.G (Geometry)": <percentage 0-100>,
    "7.SP (Statistics)": <percentage 0-100>
  },
  "standardsMet": [
    {
      "code": "<exact standard code like 7.RP.1>",
      "description": "<what the standard requires>",
      "evidence": "<which assignment/document addresses this, what page/section, and how it addresses the standard>"
    }
  ],
  "standardsNotMet": [
    {
      "code": "<exact standard code>",
      "description": "<what the standard requires>",
      "importance": "<why this matters for student learning>",
      "impact": "<impact on student learning and future math success>"
    }
  ],
  "recommendations": [
    {
      "priority": "<CRITICAL|HIGH|MEDIUM>",
      "standard": "<standard code(s)>",
      "action": "<specific, actionable recommendation for addressing this gap>",
      "timeframe": "<when to implement this>",
      "rationale": "<why this is important and how it will help students>"
    }
  ]
}

CRITICAL INSTRUCTIONS:
1. Base your analysis ONLY on the ACTUAL CONTENT you can see in the attached PDF documents
2. If you can read math problems, worksheets, or exercises in the PDFs, analyze what standards they address
3. Provide specific evidence with page numbers or problem numbers when possible
4. Be thorough - check ALL standards from the standards document provided
5. If documents are not readable or not provided, clearly state this in the summary
6. Do NOT make assumptions about what might be taught - only report what you can actually see in the materials`
      }
    ];

    // Add all the PDF files as documents
    if (filesData && filesData.length > 0) {
      filesData.forEach(file => {
        messageContent.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: file.base64
          }
        });
      });
    }

    console.log('📤 Sending request to Claude API...');

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: messageContent
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract text from response
    const responseText = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    // Clean and parse JSON
    const cleanedText = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const analysisResult = JSON.parse(cleanedText);

    console.log('✅ Analysis complete');
    
    return res.status(200).json(analysisResult);
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message 
    });
  }
}
