// api/analyze.js
// This is your Vercel serverless function

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { assignments, gradeLevel, subject, courseName } = req.body;

    // Build the prompt for Claude
    const assignmentDetails = assignments.map(a => ({
      title: a.title,
      description: a.description,
      type: a.type,
      points: a.maxPoints,
      attachments: a.materials?.length || 0
    }));

    const prompt = `You are an expert in California Common Core State Standards for Grade ${gradeLevel} Mathematics. 

Analyze this course's alignment with CA Common Core Standards:

COURSE: ${courseName}
GRADE LEVEL: ${gradeLevel}
SUBJECT: ${subject}

ASSIGNMENTS (${assignments.length} total):
${JSON.stringify(assignmentDetails, null, 2)}

CALIFORNIA COMMON CORE STANDARDS FOR GRADE 7 MATHEMATICS:
The Grade 7 Math standards are organized into 5 domains:

1. 7.RP - Ratios and Proportional Relationships
   - 7.RP.1: Compute unit rates
   - 7.RP.2.a: Decide if quantities are proportional
   - 7.RP.2.b: Identify constant of proportionality
   - 7.RP.2.c: Represent proportional relationships by equations
   - 7.RP.2.d: Explain points on graphs
   - 7.RP.3: Use proportions to solve multistep problems

2. 7.NS - The Number System
   - 7.NS.1: Add and subtract rational numbers
   - 7.NS.2: Multiply and divide rational numbers
   - 7.NS.3: Solve real-world problems with rational numbers

3. 7.EE - Expressions and Equations
   - 7.EE.1: Apply properties to linear expressions
   - 7.EE.2: Rewrite expressions in different forms
   - 7.EE.3: Solve multi-step problems
   - 7.EE.4.a: Solve equations px + q = r
   - 7.EE.4.b: Solve inequalities

4. 7.G - Geometry
   - 7.G.1: Scale drawings
   - 7.G.2: Draw geometric shapes
   - 7.G.3: Cross-sections of 3D figures
   - 7.G.4: Circle formulas
   - 7.G.5: Angle relationships
   - 7.G.6: Area, volume, surface area

5. 7.SP - Statistics and Probability
   - 7.SP.1-2: Random sampling and inferences
   - 7.SP.3-4: Compare populations
   - 7.SP.5-8: Probability models and compound events

Provide a JSON response (ONLY JSON, no markdown) with this EXACT structure:
{
  "score": <number 0-100>,
  "summary": "<brief analysis>",
  "domains": {
    "7.RP (Ratios)": <percentage>,
    "7.NS (Number System)": <percentage>,
    "7.EE (Expressions)": <percentage>,
    "7.G (Geometry)": <percentage>,
    "7.SP (Statistics)": <percentage>
  },
  "standardsMet": [
    {
      "code": "<exact standard code like 7.RP.1>",
      "description": "<what the standard requires>",
      "evidence": "<which assignment addresses this and how>"
    }
  ],
  "standardsNotMet": [
    {
      "code": "<exact standard code>",
      "description": "<what the standard requires>",
      "importance": "<why this matters>",
      "impact": "<impact on student learning>"
    }
  ],
  "recommendations": [
    {
      "priority": "<CRITICAL|HIGH|MEDIUM>",
      "standard": "<standard code(s)>",
      "action": "<specific action to take>",
      "timeframe": "<when to implement>",
      "rationale": "<why this is important>"
    }
  ]
}

Be thorough and specific. List ALL standards that are not met.`;

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
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt
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

    return res.status(200).json(analysisResult);
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message 
    });
  }
}
