from django.contrib import messages
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render

from .forms import PersonForm
from .models import Person


def person_list(request):
    people = Person.objects.select_related('father', 'mother').all()
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
    people = Person.objects.select_related('father', 'mother').all()
    nodes = []
    links = []

    for person in people:
        nodes.append(
            {
                'id': person.id,
                'name': person.first_name,
                'status': person.status,
                'birth_date': person.birth_date.strftime('%Y-%m-%d'),
                'death_date': person.death_date.strftime('%Y-%m-%d') if person.death_date else None,
                'photo': person.photo.url if person.photo else None,
            }
        )
        if person.father_id:
            links.append({'source': person.father_id, 'target': person.id, 'relation': 'father'})
        if person.mother_id:
            links.append({'source': person.mother_id, 'target': person.id, 'relation': 'mother'})

    return JsonResponse({'nodes': nodes, 'links': links})
