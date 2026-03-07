import base64
import io
import json

from django.contrib import messages
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.csrf import csrf_exempt
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from .forms import PersonForm
from .models import Person


def person_list(request):
    people = Person.objects.select_related('father', 'mother', 'spouse').all()
    return render(request, 'treeapp/person_list.html', {'people': people})


def person_create(request):
    if request.method == 'POST':
        form = PersonForm(request.POST, request.FILES)
        if form.is_valid():
            form.save()
            messages.success(request, 'Personne ajoutée avec succès.')
            return redirect('person_list')
    else:
        form = PersonForm()
    return render(request, 'treeapp/person_form.html', {'form': form, 'title': 'Ajouter une personne'})


def person_update(request, pk):
    person = get_object_or_404(Person, pk=pk)
    if request.method == 'POST':
        form = PersonForm(request.POST, request.FILES, instance=person)
        if form.is_valid():
            form.save()
            messages.success(request, 'Personne mise à jour avec succès.')
            return redirect('person_list')
    else:
        form = PersonForm(instance=person)
    return render(request, 'treeapp/person_form.html', {'form': form, 'title': f'Modifier {person.first_name}'})


def tree_view(request):
    return render(request, 'treeapp/tree.html')


def tree_data(request):
    people = Person.objects.select_related('father', 'mother', 'spouse').all()
    nodes = []

    for person in people:
        nodes.append(
            {
                'id': person.id,
                'name': person.first_name,
                'status': person.status,
                'birth_date': person.birth_date.strftime('%Y-%m-%d'),
                'death_date': person.death_date.strftime('%Y-%m-%d') if person.death_date else None,
                'photo': person.photo.url if person.photo else person.image_url,
                'father_id': person.father_id,
                'mother_id': person.mother_id,
                'spouse_id': person.spouse_id,
            }
        )

    return JsonResponse({'nodes': nodes})


@csrf_exempt
def export_pdf(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            orig_width = float(data.get('width', 1000))
            orig_height = float(data.get('height', 800))
            
            # Use A4 Landscape page size
            page_width, page_height = landscape(A4)
            
            buffer = io.BytesIO()
            p = canvas.Canvas(buffer, pagesize=(page_width, page_height))
            
            # Calculate scaling to fit the tree into the page, allowing some margin
            margin_x = 20
            margin_y = 20
            avail_width = page_width - (margin_x * 2)
            avail_height = page_height - (margin_y * 2)
            
            scale = min(avail_width / orig_width, avail_height / orig_height)
            if scale > 1.0:
                scale = 1.0 # Only scale down, not up
                
            # Center it
            scaled_width = orig_width * scale
            scaled_height = orig_height * scale
            x_offset = margin_x + (avail_width - scaled_width) / 2
            y_offset = margin_y + (avail_height - scaled_height) / 2
            
            p.translate(x_offset, y_offset)
            p.scale(scale, scale)
            
            # Draw links
            for link in data.get('links', []):
                p.setStrokeColor(link.get('color', '#9ca3af'))
                p.setLineWidth(float(link.get('width', 2)))
                y1 = orig_height - float(link['y1'])
                y2 = orig_height - float(link['y2'])
                p.line(float(link['x1']), y1, float(link['x2']), y2)
                
            # Draw connector texts (like the hearts)
            for t in data.get('texts', []):
                p.setFillColor(t.get('color', '#ef4444'))
                p.setFont("Helvetica", float(t.get('size', 16)))
                p.drawCentredString(float(t['x']), orig_height - float(t['y']), str(t.get('text', '')))
                
            # Draw nodes
            for node in data.get('nodes', []):
                x = float(node['x'])
                y = orig_height - float(node['y']) # the point of reference is the center of the node
                
                # Colors
                status_color = node.get('statusColor', '#2f855a')
                
                # Draw white background filled circle
                p.setFillColorRGB(1, 1, 1)
                p.setStrokeColor(status_color)
                p.setLineWidth(3)
                node_radius = float(node.get('r', 30))
                p.circle(x, y, node_radius, fill=1, stroke=1)
                
                # Draw photo
                photo_data = node.get('photo')
                photo_radius = float(node.get('photo_r', 25))
                if photo_data and photo_data.startswith('data:image'):
                    try:
                        header, imgstr = photo_data.split(';base64,')
                        img_data = base64.b64decode(imgstr)
                        img = ImageReader(io.BytesIO(img_data))
                        
                        p.saveState()
                        path = p.beginPath()
                        path.circle(x, y, photo_radius)
                        p.clipPath(path, stroke=0, fill=0)
                        p.drawImage(img, x - photo_radius, y - photo_radius, photo_radius * 2, photo_radius * 2, preserveAspectRatio=True)
                        p.restoreState()
                    except Exception as e:
                        pass
                else:
                    # Draw a placeholder inside if no image
                    p.setFillColorRGB(0.9, 0.9, 0.9) # gray placeholder
                    p.circle(x, y, photo_radius, fill=1, stroke=0)
                
                # Name (array of lines to draw below node)
                p.setFillColorRGB(0.12, 0.16, 0.21) # #1f2937
                p.setFont("Helvetica-Bold", 15)
                name_lines = node.get('name_lines', [])
                # Text anchoring in ReportLab uses baseline logic
                base_y = y - node_radius - 18
                for i, line in enumerate(name_lines):
                    p.drawCentredString(x, base_y - (i * 16), str(line))
                    
                # Dates
                p.setFillColorRGB(0.05, 0.64, 0.91) # #0ea5e9
                p.setFont("Helvetica", 12)
                dates_y = base_y - (len(name_lines) * 16) - 6
                p.drawCentredString(x, dates_y, str(node.get('dates', '')))

            p.showPage()
            p.save()
            pdf = buffer.getvalue()
            buffer.close()
            
            response = HttpResponse(pdf, content_type='application/pdf')
            response['Content-Disposition'] = 'attachment; filename="arbre-genealogique.pdf"'
            return response
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'error': str(e)}, status=500)
            
    return JsonResponse({'error': 'Invalid request method'}, status=405)
