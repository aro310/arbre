from django.urls import path

from . import views

urlpatterns = [
    path('', views.person_list, name='person_list'),
    path('personnes/ajouter/', views.person_create, name='person_create'),
    path('personnes/<int:pk>/modifier/', views.person_update, name='person_update'),
    path('arbre/', views.tree_view, name='tree_view'),
    path('api/arbre/', views.tree_data, name='tree_data'),
    path('api/export-pdf/', views.export_pdf, name='export_pdf'),
]
