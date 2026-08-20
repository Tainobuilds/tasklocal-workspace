import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dataFilePath = path.join(process.cwd(), 'data', 'listings.json');

export async function GET() {
  try {
    const fileData = fs.readFileSync(dataFilePath, 'utf8');
    const listings = JSON.parse(fileData);
    return NextResponse.json(listings);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read listings data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const newListing = await request.json();
    const fileData = fs.readFileSync(dataFilePath, 'utf8');
    const listings = JSON.parse(fileData);
    
    listings.push(newListing);
    fs.writeFileSync(dataFilePath, JSON.stringify(listings, null, 2));
    
    return NextResponse.json({ success: true, listing: newListing });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save new listing' }, { status: 500 });
  }
}