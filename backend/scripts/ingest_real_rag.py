"""
Script to ingest actual PDFs from backend/kb into Supabase pgvector.
It extracts text using pdfplumber, chunks it via LangChain, and embeds it via OpenAI.

Run: python -m scripts.ingest_real_rag
"""

import os
import sys
import glob

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pdfplumber
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import OpenAI
from app.config import settings
from app.database import supabase

# Tắt warning regex của pdfplumber nếu file lớn
import logging
logging.getLogger("pdfminer").setLevel(logging.WARNING)

client = OpenAI(api_key=settings.OPENAI_API_KEY)

KB_DIR = os.path.join(os.path.dirname(__file__), "..", "kb")

def extract_text_from_pdf(pdf_path: str) -> str:
    text = ""
    print(f"Reading PDF: {pdf_path}")
    try:
        with pdfplumber.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)
            for i, page in enumerate(pdf.pages):
                if i % 10 == 0:
                    print(f"  Processed {i}/{total_pages} pages...")
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n\n"
    except Exception as e:
        print(f"❌ Error reading PDF {pdf_path}: {e}")
    return text

def ingest_kb_documents():
    """Ingest all PDFs in the kb folder."""
    pdf_files = glob.glob(os.path.join(KB_DIR, "*.pdf"))
    if not pdf_files:
        print(f"No PDFs found in {KB_DIR}")
        return

    print(f"📚 Found {len(pdf_files)} PDF(s) to ingest.")

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", ".", " ", ""],
    )

    for doc_path in pdf_files:
        filename = os.path.basename(doc_path)
        print(f"\nProcessing {filename}...")
        
        # Determine subject and grade from filename heuristically (hardcoded for this specific demo file)
        subject = "Toán" if "toán" in filename.lower() else "Chung"
        grade = "11" if "11" in filename else "Khác"
        
        text = extract_text_from_pdf(doc_path)
        if not text.strip():
            print(f"⚠️ No text could be extracted from {filename}")
            continue

        chunks = text_splitter.split_text(text)
        print(f"Created {len(chunks)} text chunks for {filename}.")
        
        # Batch inserting
        batch_size = 20
        total_chunks = len(chunks)
        
        print("Starting embedding & DB insertion...")
        for i in range(0, total_chunks, batch_size):
            batch_chunks = chunks[i: i + batch_size]
            try:
                # Embed batch
                response = client.embeddings.create(
                    input=batch_chunks,
                    model="text-embedding-3-small"
                )
                embeddings = [data.embedding for data in response.data]
                
                # Insert into DB
                records = []
                for j, chunk_text in enumerate(batch_chunks):
                    records.append({
                        "source": f"kb_{filename}",
                        "subject": subject,
                        "grade": grade,
                        "content": chunk_text,
                        "embedding": embeddings[j]
                    })
                
                supabase.table("rag_knowledge_base").insert(records).execute()
                print(f"  ✅ Inserted chunks {i} to {i+len(batch_chunks)} / {total_chunks}")
            except Exception as e:
                print(f"  ❌ Error processing batch {i}-{i+len(batch_chunks)}: {e}")

    print("\n🎉 All real KB documents ingestion is complete!")

if __name__ == "__main__":
    ingest_kb_documents()
