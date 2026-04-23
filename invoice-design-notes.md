# Reference Invoice Design Notes

## Layout (white background, clean minimal, no dark header)

### Header (top section, two-column)
LEFT:
- HP logo (circular seal, ~60px)
- "Handy Pioneers" bold large
- 808 SE Chkalov Dr, 3-433
- Vancouver, WA 98683

RIGHT (bordered table, light gray border):
- JOB | #2452
- INVOICE | #167
- SERVICE DATE | Jan 09, 2025
- INVOICE DATE | Jan 09, 2025
- PAYMENT TERMS | Upon receipt
- (separator)
- AMOUNT DUE | **$150.00** (bold large)

### Customer block (below header, two-column)
LEFT:
- Customer name (plain text)
- Address line 1
- City, State ZIP
- (blank line)
- phone icon + phone number
- email icon + email

RIGHT:
- "CONTACT US" label (small caps, gray)
- (separator line)
- phone icon + (360) 544-9858
- email icon + help@handypioneers.com

### Invoice section
- "INVOICE" heading (large, plain)
- Table header row (light gray bg): Services | qty | unit price | amount
- Line item row: service name bold | qty | unit price | amount
- Description text below (smaller, gray, multi-line)

### Totals (right-aligned block)
- Subtotal | $225.00
- Total Tax | $19.58
  - Tax Imported from Quickbooks (8.7%) | $19.58
- **Job Total** | **$244.58**
- **Amount Due** | **$150.00** (larger bold)

### Payment History
- "Payment History" heading
- Row: date | day+time | amount

### Footer (page 2)
- "See our Terms & Conditions (URL)"
- Separator line
- "Handy Pioneers | HANDYP*761NH" | "http://handypioneers.com" | page number

## Typography
- Font: system sans-serif (appears to be Helvetica/Arial)
- All caps for labels (JOB, INVOICE, SERVICE DATE, etc.)
- Bold for company name, totals
- Light gray (#888) for secondary text
- No colored backgrounds except light gray table header

## Key differences from current InvoicePrintView
1. NO dark slate header — white background throughout
2. Meta table (JOB/INVOICE/DATE/TERMS/AMOUNT DUE) is a bordered box top-right
3. Customer info is left, HP contact is right (below meta table)
4. Line items table has light gray header row, no heavy borders
5. Totals are right-aligned, indented tax breakdown
6. Payment History is centered/left below totals
7. Footer has license number (HANDYP*761NH) and website
8. Page numbers in footer
9. No colored badges, no dark backgrounds anywhere
